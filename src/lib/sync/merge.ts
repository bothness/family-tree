// Merging two people's edits (shared family edition). Plain TypeScript, no browser or Svelte APIs, so the server
// can use it too.
//
// A three-way merge: `base` is the version both sides started from (the last one this device synced), `local` is
// this device's data, `remote` is the newest saved version. Anything only one side changed is taken from that
// side, at every level:
// - the top-level lists (people, families, …) and lists of things with an `id`, or a `personId` (a family's
//   partners and children, an event's participants), are merged item by item, so two people editing different
//   people, or adding different children to one family, never clash
// - other lists (tags, to-dos, links, citations) are merged as sets: additions from both sides, removals from either
// - a person's `names` is one value (its order says which name is primary)
// - `meta` (who changed what, when) takes the later of the two; photo thumbnails (remade on each device) take either
// Clashes are settled by rules, never by asking:
// - the same thing changed differently on both sides: the more recently edited person (family, event…) wins, by
//   its `meta.updatedAt` (stamped by `stampChanges` when a device saves); if that's not known, this device wins
// - deleted on one side but edited on the other: kept (someone is still working on it)
// - afterwards the model's rules are repaired: no references to things that are gone, each child in one family
//   (the other editors' choice), at most two partners (the other editors' first)
// What was settled is listed in `resolved`, for tests and troubleshooting; the app doesn't show it.
import type { Dataset } from '../model/types.ts';
import { migrate } from '../model/migrate.ts';
import { prune } from '../model/mutations.ts';

/** A step into the data: an object's field, or the item with this id (or personId) in a list. */
export type PathSeg = string | { key: string };

export interface Resolved {
	/** both-changed: the same thing edited differently (`kept` the newer edit); deleted-vs-edited: removed on one
	 *  side, changed on the other (the edited version kept); repaired: a rule of the model was fixed. */
	kind: 'both-changed' | 'deleted-vs-edited' | 'repaired';
	/** Where: the top-level list ("people"), the item's id, and the path within it. */
	collection: string;
	id: string;
	path: PathSeg[];
	local?: unknown;
	remote?: unknown;
	/** Which side's value the merged data has. */
	kept: 'local' | 'remote';
	note?: string;
}

export interface MergeResult {
	data: Dataset;
	resolved: Resolved[];
}

type Side = 'local' | 'remote';
const stamp = (x: unknown) => (isObj(x) && isObj(x.meta) ? String(x.meta.updatedAt ?? '') : '');
/** The more recently edited of two versions of an item (this device's if that's not known). */
const newer = (a: unknown, b: unknown): Side => (stamp(b) > stamp(a) ? 'remote' : 'local');

/** Lists whose order means something and whose items have no id: kept whole. */
const WHOLE = new Set(['names']);
const ID_KEYS = ['id', 'personId'] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep equality that ignores the order of an object's keys (lists' order counts). */
export function eq(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]));
	if (!isObj(a) || !isObj(b)) return false;
	const ka = Object.keys(a).filter((k) => a[k] !== undefined),
		kb = Object.keys(b).filter((k) => b[k] !== undefined);
	return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
}

/** The key a list's items are identified by, if they all have one. */
function keyOf(...lists: unknown[][]): string | undefined {
	const items = lists.flat();
	if (!items.length || !items.every(isObj)) return undefined;
	return ID_KEYS.find((k) => items.every((x) => typeof (x as Obj)[k] === 'string'));
}

const json = (v: unknown) => JSON.stringify(sortKeys(v));
function sortKeys(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(sortKeys);
	if (!isObj(v)) return v;
	return Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, sortKeys(v[k])]));
}

/** Data in the form it's saved in: upgraded to the current schema, and through JSON (so a missing field and
 *  one set to undefined are the same). */
export const normalise = (d: unknown): Dataset => JSON.parse(JSON.stringify(migrate(structuredClone(d))));

export function merge3(base: unknown, local: unknown, remote: unknown): MergeResult {
	const o = normalise(base),
		a = normalise(local),
		b = normalise(remote);
	const conflicts: Resolved[] = [];

	const where = (path: PathSeg[]) => {
		const id = path.find((s): s is { key: string } => typeof s !== 'string');
		return { collection: String(path[0] ?? ''), id: id?.key ?? '', path: path.slice(id ? path.indexOf(id) + 1 : 1) };
	};

	function m(o: unknown, a: unknown, b: unknown, path: PathSeg[], prefer: Side = 'local'): unknown {
		if (eq(a, b)) return a;
		if (eq(o, a)) return b;
		if (eq(o, b)) return a;
		const field = path.at(-1);
		// Never conflicts: who changed what (the later wins), and thumbnails remade on each device (either will do).
		if (field === 'meta' && isObj(a) && isObj(b)) return String(a.updatedAt ?? '') >= String(b.updatedAt ?? '') ? a : b;
		if (field === 'thumb') return a ?? b;
		if (isObj(a) && isObj(b)) {
			const ob = isObj(o) ? o : {};
			const out: Obj = {};
			for (const k of [...new Set([...Object.keys(b), ...Object.keys(a)])]) {
				const v = m(ob[k], a[k], b[k], [...path, k], prefer);
				if (v !== undefined) out[k] = v;
			}
			return out;
		}
		if (Array.isArray(a) && Array.isArray(b) && !(typeof field === 'string' && WHOLE.has(field))) {
			const ol = Array.isArray(o) ? o : [];
			const key = keyOf(ol, a, b);
			return key ? keyed(ol, a, b, key, path, prefer) : asSet(ol, a, b);
		}
		conflicts.push({ kind: 'both-changed', ...where(path), local: a, remote: b, kept: prefer });
		return prefer === 'local' ? a : b;
	}

	/** Lists of things with ids, merged item by item: the remote order, then local additions. */
	function keyed(o: unknown[], a: unknown[], b: unknown[], key: string, path: PathSeg[], prefer: Side): unknown[] {
		const by = (l: unknown[]) => new Map(l.map((x) => [(x as Obj)[key] as string, x]));
		const O = by(o),
			A = by(a),
			B = by(b);
		const ids = [...new Set([...B.keys(), ...A.keys()])];
		const out: unknown[] = [];
		for (const id of ids) {
			const oi = O.get(id),
				ai = A.get(id),
				bi = B.get(id);
			const p = [...path, { key: id }];
			// Clashes inside a top-level item go to whichever side edited that item more recently.
			if (ai !== undefined && bi !== undefined) out.push(m(oi, ai, bi, p, path.length === 1 ? newer(ai, bi) : prefer));
			else if (ai !== undefined) {
				// Only here: added locally, or deleted remotely (kept if this side edited it meanwhile).
				if (oi === undefined) out.push(ai);
				else if (!eq(oi, ai)) {
					conflicts.push({ kind: 'deleted-vs-edited', ...where(p), local: ai, kept: 'local', note: 'deleted on the other device, edited on this one' });
					out.push(ai);
				}
			} else if (bi !== undefined) {
				if (oi === undefined) out.push(bi);
				else if (!eq(oi, bi)) {
					conflicts.push({ kind: 'deleted-vs-edited', ...where(p), remote: bi, kept: 'remote', note: 'deleted on this device, edited on the other' });
					out.push(bi);
				}
			}
		}
		return out;
	}

	/** Other lists, as sets: what either side added, minus what either side removed (remote order first). */
	function asSet(o: unknown[], a: unknown[], b: unknown[]): unknown[] {
		const O = new Set(o.map(json)),
			A = new Set(a.map(json)),
			B = new Set(b.map(json));
		const out: unknown[] = [],
			seen = new Set<string>();
		for (const x of [...b, ...a]) {
			const k = json(x);
			if (seen.has(k)) continue;
			seen.add(k);
			const removed = O.has(k) && (!A.has(k) || !B.has(k));
			if (!removed) out.push(x);
		}
		return out;
	}

	const merged = m(o, a, b, []) as Dataset;
	const data = structuredClone(merged);
	// Someone kept because the other side edited them: deleting them also took them out of their families and
	// removed their life events, so bring those back from the side that kept them.
	for (const c of conflicts)
		if (c.kind === 'deleted-vs-edited' && c.collection === 'people' && !c.path.length) restorePerson(data, c.kept === 'local' ? a : b, c.id);
	repair(data, b, conflicts);
	return { data, resolved: conflicts };
}

const COLLECTIONS = ['people', 'families', 'events', 'places', 'sources', 'views', 'media'] as const;
const withoutMeta = (x: Obj) => ({ ...x, meta: undefined });

/** Mark what changed since `base` (people, families, events, places…) with when and by whom, so a later merge
 *  can tell which edit is newer; unchanged items keep the stamp they had in `base` (so the app's own copy needn't
 *  carry stamps). Changes `d` in place. */
export function stampChanges(base: Dataset | null, d: Dataset, by: string, at = new Date().toISOString()) {
	for (const c of COLLECTIONS) {
		const before = new Map(((base?.[c] ?? []) as unknown as Obj[]).map((x) => [x.id as string, x]));
		for (const x of d[c] as unknown as Obj[]) {
			const old = before.get(x.id as string);
			if (old && eq(withoutMeta(old), withoutMeta(x))) {
				if (old.meta !== undefined) x.meta = structuredClone(old.meta);
				else delete x.meta;
			} else x.meta = { ...(isObj(x.meta) ? x.meta : {}), updatedAt: at, updatedBy: by };
		}
	}
}

/** Bring back a person's family links, life events and photo from `from` (the side that kept them). */
function restorePerson(d: Dataset, from: Dataset, pid: string) {
	for (const e of from.events) {
		if (!e.participants.some((x) => x.personId === pid)) continue;
		const here = d.events.find((x) => x.id === e.id);
		if (!here) d.events.push(structuredClone(e));
		else if (!here.participants.some((x) => x.personId === pid)) here.participants.push(structuredClone(e.participants.find((x) => x.personId === pid)!));
	}
	for (const f of from.families) {
		const roles = (['partners', 'children'] as const).filter((l) => (f[l] ?? []).some((x) => x.personId === pid));
		if (!roles.length) continue;
		const here = d.families.find((x) => x.id === f.id);
		if (!here) {
			d.families.push(structuredClone(f));
			continue;
		}
		for (const l of roles) if (!(here[l] ?? []).some((x) => x.personId === pid)) (here[l] ??= []).push(structuredClone(f[l].find((x) => x.personId === pid)!));
	}
	const photo = from.people.find((x) => x.id === pid)?.photo;
	const m = photo && from.media.find((x) => x.id === photo);
	if (m && !d.media.some((x) => x.id === m.id)) d.media.push(structuredClone(m));
}

/** Fix what merging item by item can't guarantee, reporting each fix. `remote` decides ties (it's what the other
 *  editors already have). */
function repair(d: Dataset, remote: Dataset, conflicts: Resolved[]) {
	const fixed = (collection: string, id: string, path: PathSeg[], note: string, local?: unknown) =>
		conflicts.push({ kind: 'repaired', collection, id, path, local, kept: 'remote', note });
	const people = new Set(d.people.map((p) => p.id));

	// References to people who are gone.
	for (const f of d.families) {
		for (const list of ['partners', 'children'] as const) {
			const gone = (f[list] ?? []).filter((x) => !people.has(x.personId));
			if (!gone.length) continue;
			f[list] = (f[list] ?? []).filter((x) => people.has(x.personId));
			for (const g of gone) fixed('families', f.id, [list, { key: g.personId }], 'refers to someone who was deleted', g);
		}
	}
	for (const e of d.events) {
		const gone = e.participants.filter((x) => !people.has(x.personId));
		if (gone.length) {
			e.participants = e.participants.filter((x) => people.has(x.personId));
			for (const g of gone) fixed('events', e.id, ['participants', { key: g.personId }], 'refers to someone who was deleted', g);
		}
	}
	const keepEvents = d.events.filter((e) => e.participants.length);
	for (const e of d.events) if (!e.participants.length) fixed('events', e.id, [], 'nobody left in it', e);
	d.events = keepEvents;

	// Each child in exactly one family: the one the other editors have them in (else the first by id).
	const remoteParent = new Map(remote.families.flatMap((f) => (f.children ?? []).map((c) => [c.personId, f.id] as const)));
	const inFamilies = new Map<string, string[]>();
	for (const f of [...d.families].sort((x, y) => x.id.localeCompare(y.id)))
		for (const c of f.children ?? []) inFamilies.set(c.personId, [...(inFamilies.get(c.personId) ?? []), f.id]);
	for (const [cid, fids] of inFamilies) {
		if (fids.length < 2) continue;
		const keep = fids.includes(remoteParent.get(cid) ?? '') ? remoteParent.get(cid)! : fids[0];
		for (const f of d.families)
			if (f.id !== keep && f.children?.some((c) => c.personId === cid)) {
				fixed('families', f.id, ['children', { key: cid }], `was also a child of ${keep}; kept there`, f.children.find((c) => c.personId === cid));
				f.children = f.children.filter((c) => c.personId !== cid);
			}
	}

	// At most two partners: the other editors' ones first.
	const remotePartners = new Map(remote.families.map((f) => [f.id, new Set((f.partners ?? []).map((p) => p.personId))]));
	for (const f of d.families) {
		if ((f.partners ?? []).length <= 2) continue;
		const theirs = remotePartners.get(f.id) ?? new Set();
		const ordered = [...f.partners].sort((x, y) => Number(theirs.has(y.personId)) - Number(theirs.has(x.personId)));
		for (const x of ordered.slice(2)) fixed('families', f.id, ['partners', { key: x.personId }], 'a family can have at most two partners', x);
		f.partners = ordered.slice(0, 2);
	}

	// Photos, places and views that point at nothing.
	const media = new Set(d.media.map((m) => m.id));
	for (const p of d.people)
		if (p.photo && !media.has(p.photo)) {
			fixed('people', p.id, ['photo'], 'the photo was removed', p.photo);
			delete p.photo;
		}
	d.media = d.media.filter((m) => d.people.some((p) => p.photo === m.id));
	const places = new Set(d.places.map((p) => p.id));
	for (const e of d.events)
		if (e.place && !places.has(e.place.placeId)) {
			fixed('events', e.id, ['place'], 'the place was removed', e.place);
			delete e.place;
		}
	const keptPeople = new Set(d.people.map((p) => p.id));
	d.views = d.views.filter((v) => !v.scope?.root || keptPeople.has(v.scope.root));
	for (const v of d.views) if (v.scope?.people) v.scope.people = v.scope.people.filter((x) => keptPeople.has(x));

	prune(d);
}
