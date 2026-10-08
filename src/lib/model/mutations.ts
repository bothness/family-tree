// Changes to a Dataset. Functions mutate in place (works with Svelte 5 $state proxies) and are unit-tested.
import type { Dataset, Family, Person, Sex, Status } from './types.ts';
import { parseUserDate } from './edtf.ts';
import { childIds, coupleFam, displayName, famAsChild, family, famsAsPartner, lifeEvent, partnerIds, person, placeName, soloFam } from './queries.ts';

export const uid = (prefix: string) =>
	`${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyDataset(): Dataset {
	return { schemaVersion: '0.2', people: [], families: [], events: [], places: [], sources: [], views: [] };
}

export function findOrCreatePlace(d: Dataset, name: string): string | null {
	name = name.trim();
	if (!name) return null;
	let p = d.places.find((p) => p.name.toLowerCase() === name.toLowerCase());
	if (!p) {
		p = { id: uid('plc'), name };
		d.places.push(p);
	}
	return p.id;
}

/** Set (or clear) a birth/death date and place. Pass null to leave a part unchanged. */
export function setLife(d: Dataset, pid: string, kind: 'birth' | 'death', dateStr: string | null, placeStr: string | null, status?: Status) {
	let e = lifeEvent(d, pid, kind);
	const edtf = dateStr != null ? parseUserDate(dateStr) : (e?.date?.edtf ?? '');
	const place = placeStr != null ? placeStr.trim() : e?.place ? placeName(d, e.place.placeId) : '';
	if (!edtf && !place) {
		if (e) d.events = d.events.filter((x) => x !== e);
		return;
	}
	if (!e) {
		d.events.push({ id: uid('evt'), type: kind, participants: [{ personId: pid }] });
		e = d.events.at(-1)!; // the stored (proxied) copy, so later changes are tracked
	}
	if (edtf) {
		e.date = { ...(e.date ?? {}), edtf };
		if (status) e.date.status = status;
	} else delete e.date;
	if (place) e.place = { ...(e.place ?? {}), placeId: findOrCreatePlace(d, place)! };
	else delete e.place;
}

/** Create a person from a single name string ("Mary Ann Smith" → given "Mary Ann", surname "Smith"). */
export function newPerson(d: Dataset, name = '', opts: { unsure?: boolean; tags?: string[]; sex?: Sex } = {}): Person {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const n = parts.length
		? { given: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0], surname: parts.length > 1 ? parts.at(-1) : undefined }
		: null;
	const p: Person = { id: uid('per'), names: [], research: { stage: 'sketch' } };
	if (n) p.names!.push(opts.unsure ? { ...n, status: 'guess' } : n);
	if (opts.sex) p.sex = { value: opts.sex };
	if (opts.tags?.length) p.tags = [...opts.tags];
	d.people.push(p);
	return d.people.at(-1)!;
}

export function newFamily(d: Dataset, partners: string[]): Family {
	const f: Family = { id: uid('fam'), partners: partners.map((personId) => ({ personId })), children: [], childrenComplete: 'unknown' };
	d.families.push(f);
	// Return the stored element, not `f`: under a Svelte $state proxy, pushing stores a proxied copy, and later
	// changes made through the original object (e.g. adding a child) would be lost.
	return d.families.at(-1)!;
}

export function detachChild(d: Dataset, cid: string) {
	const f = famAsChild(d, cid);
	if (!f) return null;
	const l = f.children.find((c) => c.personId === cid)!;
	f.children = f.children.filter((c) => c !== l);
	return l;
}

/** Make `cid` a child of `f`, moving them out of any previous family. */
export function attachChild(d: Dataset, f: Family, cid: string, unsure = false) {
	const l = detachChild(d, cid) ?? { personId: cid };
	if (unsure) l.status = 'guess';
	(f.children ??= []).push(l);
}

/** Remove families that no longer carry information. */
export function prune(d: Dataset) {
	d.families = d.families.filter((f) => {
		const np = (f.partners ?? []).length,
			nc = (f.children ?? []).length;
		if (np === 0) return nc > 1; // sibling-only group
		if (np === 1) return nc > 0 || f.childrenComplete === 'no';
		return true; // couple, with or without children
	});
}

export type RelativeKind = 'parent' | 'partner' | 'child' | 'sibling';
export interface LinkOptions {
	unsure?: boolean;
	/** For 'partner': children of the person's single-parent family who also belong to the new partner. */
	kids?: string[];
	/** For 'child': which of the person's families to add to; 'solo' = unknown other parent. */
	famId?: string;
}
export type LinkResult = { error: string } | { info?: string };

/**
 * Link `pid` to `oid` as the given kind of relative.
 * Siblings share parents by default; half-siblings are made by moving a child to another family.
 */
export function linkPeople(d: Dataset, kind: RelativeKind, pid: string, oid: string, opt: LinkOptions = {}): LinkResult {
	if (pid === oid) return { error: "That's the same person." };
	const name = (id: string) => displayName(person(d, id));

	if (kind === 'parent') {
		const f = famAsChild(d, pid);
		if (f) {
			const ps = partnerIds(f);
			if (ps.includes(oid)) return { error: 'Already recorded as a parent.' };
			if (ps.length >= 2) return { error: "Two parents are already recorded. Use 'Child of' to change them." };
			if (ps.length === 1) {
				const g = coupleFam(d, ps[0], oid);
				if (g) {
					attachChild(d, g, pid);
					prune(d);
					return {};
				}
			}
			f.partners.push(opt.unsure ? { personId: oid, status: 'guess' } : { personId: oid });
			const others = childIds(f).length - 1;
			return others > 0
				? { info: `Also added as a parent of ${others} sibling(s). Use 'Child of' on a half-sibling to change this.` }
				: {};
		}
		attachChild(d, soloFam(d, oid) ?? newFamily(d, [oid]), pid, opt.unsure);
		prune(d);
		return {};
	}

	if (kind === 'child') {
		const f =
			opt.famId === 'solo'
				? (soloFam(d, pid) ?? newFamily(d, [pid]))
				: (family(d, opt.famId) ?? famsAsPartner(d, pid)[0] ?? newFamily(d, [pid]));
		const cur = famAsChild(d, oid);
		if (cur === f) return { error: 'Already recorded as a child here.' };
		attachChild(d, f, oid, opt.unsure);
		prune(d);
		return cur && partnerIds(cur).length ? { info: `${name(oid)} was moved from their previously recorded parents.` } : {};
	}

	if (kind === 'partner') {
		if (coupleFam(d, pid, oid)) return { error: 'Already recorded as partners.' };
		const s = soloFam(d, pid),
			sk = s ? childIds(s) : [],
			kids = (opt.kids ?? []).filter((k) => sk.includes(k));
		if (s && sk.length && kids.length === sk.length) {
			s.partners.push({ personId: oid });
			return {};
		}
		const f = newFamily(d, [pid, oid]);
		kids.forEach((k) => attachChild(d, f, k));
		prune(d);
		return {};
	}

	// sibling
	let f = famAsChild(d, pid);
	const g = famAsChild(d, oid);
	if (f && f === g) return { error: 'Already recorded as siblings.' };
	if (!f && g) {
		attachChild(d, g, pid);
		return {};
	}
	if (!f) {
		f = newFamily(d, []);
		f.children.push({ personId: pid });
	}
	if (g && partnerIds(g).length && !partnerIds(f).length) {
		childIds(f).forEach((c) => attachChild(d, g, c));
		prune(d);
		return {};
	}
	attachChild(d, f, oid, opt.unsure);
	prune(d);
	return g && partnerIds(g).length ? { info: `${name(oid)}'s previously recorded parents were replaced.` } : {};
}

/** Change which family a person is a child of. value: "fam:<id>", "solo:<parentId>" or "none". */
export function setChildOf(d: Dataset, pid: string, value: string) {
	if (value === 'none') detachChild(d, pid);
	else if (value.startsWith('fam:')) attachChild(d, family(d, value.slice(4))!, pid);
	else if (value.startsWith('solo:')) {
		const par = value.slice(5);
		attachChild(d, soloFam(d, par) ?? newFamily(d, [par]), pid);
	}
	prune(d);
}

export function deletePerson(d: Dataset, pid: string) {
	d.people = d.people.filter((p) => p.id !== pid);
	d.families.forEach((f) => {
		f.partners = (f.partners ?? []).filter((x) => x.personId !== pid);
		f.children = (f.children ?? []).filter((x) => x.personId !== pid);
	});
	d.events.forEach((e) => (e.participants = e.participants.filter((x) => x.personId !== pid)));
	d.events = d.events.filter((e) => e.participants.length);
	prune(d);
}
