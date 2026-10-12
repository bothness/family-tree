import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../schema/family-tree.schema.json';
import demo from '../data/demo-darwin.json';
import type { Dataset } from '../model/types.ts';
import { deletePerson, emptyDataset, linkPeople, newFamily, newPerson, setLife } from '../model/mutations.ts';
import { childIds, famsAsPartner, partnerIds, person } from '../model/queries.ts';
import { eq, merge3, normalise, stampChanges } from './merge.ts';
import { cite, uncite } from '../model/sources.ts';
import { setFamilyPlace } from '../model/places.ts';

const base = () => normalise(demo);
const p = (d: Dataset, id: string) => person(d, id)!;
const fam = (d: Dataset, id: string) => d.families.find((f) => f.id === id)!;

describe('merge3 basics', () => {
	it('returns either side when only one changed, or when both made the same change', () => {
		const o = base(),
			x = base();
		p(x, 'per_annie').notes = 'Changed';
		expect(eq(merge3(o, x, x).data, x)).toBe(true);
		expect(eq(merge3(o, o, x).data, x)).toBe(true);
		expect(eq(merge3(o, x, o).data, x)).toBe(true);
		expect(merge3(o, x, x).resolved).toEqual([]);
	});

	it('takes a newer schema version from the shared tree (a one-off conversion replaced it)', () => {
		const old = { ...base(), schemaVersion: '0.2' } as unknown as Dataset;
		expect(merge3(old, old, base()).data.schemaVersion).toBe('0.3');
	});

	it('takes edits to different people from both sides without conflict', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').notes = 'Edited here';
		p(b, 'per_george').notes = 'Edited there';
		const { data, resolved } = merge3(o, a, b);
		expect(resolved).toEqual([]);
		expect(p(data, 'per_annie').notes).toBe('Edited here');
		expect(p(data, 'per_george').notes).toBe('Edited there');
	});

	it('takes edits to different fields of the same person', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').notes = 'Edited here';
		p(b, 'per_annie').knownAs = 'Annie';
		const { data, resolved } = merge3(o, a, b);
		expect(resolved).toEqual([]);
		expect(p(data, 'per_annie')).toMatchObject({ notes: 'Edited here', knownAs: 'Annie' });
	});

	it('keeps different children added to the same family on both sides', () => {
		const o = base(),
			a = base(),
			b = base();
		ok(linkPeople(a, 'child', 'per_gwen', newPerson(a, 'Elisabeth Raverat').id, { famId: 'fam_raverat_darwin' }));
		ok(linkPeople(b, 'child', 'per_gwen', newPerson(b, 'Sophie Raverat').id, { famId: 'fam_raverat_darwin' }));
		const { data, resolved } = merge3(o, a, b);
		expect(resolved).toEqual([]);
		const names = childIds(fam(data, 'fam_raverat_darwin')).map((id) => p(data, id).names![0].given);
		expect(names.sort()).toEqual(['Elisabeth', 'Sophie']);
	});

	it('merges tags and to-dos as sets', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').tags = [...(p(a, 'per_annie').tags ?? []), 'malvern'];
		p(b, 'per_annie').tags = ['darwin-family'];
		p(a, 'per_maud').research!.todo!.push('Find her parents');
		const { data, resolved } = merge3(o, a, b);
		expect(resolved).toEqual([]);
		expect(p(data, 'per_annie').tags).toEqual(['darwin-family', 'malvern']);
		expect(p(data, 'per_maud').research!.todo).toContain('Find her parents');
	});

	it('never conflicts on who-changed-what, or on photo thumbnails', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').meta = { updatedAt: '2026-10-09T10:00:00Z', updatedBy: 'me' };
		p(b, 'per_annie').meta = { updatedAt: '2026-10-09T11:00:00Z', updatedBy: 'cousin' };
		for (const d of [o, a, b]) d.media.push({ id: 'media_1', kind: 'image', mime: 'image/jpeg', thumb: 'data:old' });
		a.media[0].thumb = 'data:remade-here';
		b.media[0].thumb = 'data:remade-there';
		const { data, resolved } = merge3(o, a, b);
		expect(resolved).toEqual([]);
		expect(p(data, 'per_annie').meta?.updatedBy).toBe('cousin');
	});

	it('is deterministic and shares no objects with its inputs', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').notes = 'x';
		p(b, 'per_george').notes = 'y';
		const r1 = merge3(o, a, b).data,
			r2 = merge3(o, a, b).data;
		expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
		p(r1, 'per_annie').notes = 'changed afterwards';
		expect(p(a, 'per_annie').notes).toBe('x');
	});
});

describe('shared sources and places', () => {
	it('keeps a source one side removed as unused while the other side cited it', () => {
		const o = base();
		o.sources.push({ id: 'src_letter', type: 'papers', title: 'A letter' });
		o.people.find((x) => x.id === 'per_annie')!.citations!.push({ sourceId: 'src_letter' });
		const a = structuredClone(o),
			b = structuredClone(o);
		uncite(a, 'per_annie', 'src_letter');
		expect(a.sources.some((s) => s.id === 'src_letter')).toBe(false);
		cite(b, 'per_charles', 'src_letter', 'mentions him');
		const { data } = merge3(o, a, b);
		expect(data.sources.some((s) => s.id === 'src_letter')).toBe(true);
		expect(p(data, 'per_charles').citations).toContainEqual({ sourceId: 'src_letter', detail: 'mentions him' });
		expect(p(data, 'per_annie').citations?.some((c) => c.sourceId === 'src_letter')).toBeFalsy();
	});

	it('merges citations one by one: the same source cited or noted on both sides stays one citation', () => {
		const o = base();
		const a = structuredClone(o),
			b = structuredClone(o);
		const sid = o.sources[0].id;
		const who = o.people.find((x) => !x.citations?.some((c) => c.sourceId === sid))!.id;
		cite(a, who, sid);
		cite(b, who, sid, 'p. 4');
		const once = merge3(o, a, b).data;
		expect(p(once, who).citations!.filter((c) => c.sourceId === sid)).toHaveLength(1);
		const c2 = structuredClone(once),
			d2 = structuredClone(once);
		p(c2, who).citations!.find((c) => c.sourceId === sid)!.detail = 'here';
		p(d2, who).citations!.find((c) => c.sourceId === sid)!.detail = 'there';
		expect(p(merge3(once, c2, d2).data, who).citations!.filter((c) => c.sourceId === sid)).toHaveLength(1);
	});

	it('keeps a place one side removed as unused while the other made it where a couple married', () => {
		const o = base();
		setLife(o, 'per_annie', 'death', null, 'Nowhere Green');
		const a = structuredClone(o),
			b = structuredClone(o);
		setLife(a, 'per_annie', 'death', null, 'Malvern');
		const green = b.places.find((x) => x.name === 'Nowhere Green')!.id;
		setFamilyPlace(b, 'fam_charles_emma', green);
		const { data } = merge3(o, a, b);
		expect(fam(data, 'fam_charles_emma').relationship!.place!.placeId).toBe(green);
		expect(data.places.some((x) => x.id === green)).toBe(true);
	});

	it('keeps a place one side removed as unused while the other side used it', () => {
		const o = base();
		setLife(o, 'per_annie', 'death', null, 'Nowhere Green');
		const a = structuredClone(o),
			b = structuredClone(o);
		setLife(a, 'per_annie', 'death', null, 'Malvern');
		expect(a.places.some((x) => x.name === 'Nowhere Green')).toBe(false);
		setLife(b, 'per_charles', 'death', null, 'Nowhere Green');
		const { data } = merge3(o, a, b);
		expect(data.places.some((x) => x.name === 'Nowhere Green')).toBe(true);
	});
});

describe('clashes are settled by rules', () => {
	const birth = (d: Dataset) => d.events.find((e) => e.id === 'evt_birth_annie')!.date!.edtf;

	it('the same field changed on both sides: this device wins when nobody knows which edit is newer', () => {
		const o = base(),
			a = base(),
			b = base();
		setLife(a, 'per_annie', 'birth', '1841', null);
		setLife(b, 'per_annie', 'birth', 'c.1840', null);
		const { data, resolved } = merge3(o, a, b);
		expect(birth(data)).toBe('1841');
		expect(resolved).toMatchObject([{ kind: 'both-changed', collection: 'events', id: 'evt_birth_annie', path: ['date', 'edtf'], kept: 'local' }]);
	});

	it('the same field changed on both sides: the more recent edit wins', () => {
		const o = base(),
			a = base(),
			b = base();
		setLife(a, 'per_annie', 'birth', '1841', null);
		stampChanges(o, a, 'me', '2026-10-09T10:00:00Z');
		setLife(b, 'per_annie', 'birth', 'c.1840', null);
		stampChanges(o, b, 'cousin', '2026-10-09T11:00:00Z');
		expect(birth(merge3(o, a, b).data)).toBe('1840~');
		expect(birth(merge3(o, b, a).data)).toBe('1840~');
	});

	it('treats a list of names as one value', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').names![0].given = 'Anne';
		p(b, 'per_annie').names!.push({ type: 'alias', given: 'Annie' });
		const { data, resolved } = merge3(o, a, b);
		expect(p(data, 'per_annie').names).toEqual(p(a, 'per_annie').names);
		expect(resolved.map((c) => [c.kind, c.id, c.path])).toEqual([['both-changed', 'per_annie', ['names']]]);
	});

	it('keeps someone deleted on one side but edited on the other', () => {
		const o = base(),
			a = base(),
			b = base();
		deletePerson(a, 'per_maud');
		p(b, 'per_maud').notes = 'Found her birth certificate';
		const { data, resolved } = merge3(o, a, b);
		expect(p(data, 'per_maud').notes).toBe('Found her birth certificate');
		expect(resolved.some((c) => c.kind === 'deleted-vs-edited' && c.id === 'per_maud')).toBe(true);
		// …with her family links and life events, which deleting her had removed.
		expect(partnerIds(fam(data, 'fam_george_maud'))).toContain('per_maud');
		expect(data.events.some((e) => e.id === 'evt_death_maud')).toBe(true);
		expect(problems(data)).toEqual([]);
	});
});

describe('stampChanges', () => {
	it('marks only what changed, with when and by whom', () => {
		const o = base(),
			d = base();
		p(d, 'per_annie').notes = 'New';
		stampChanges(o, d, 'me@example.com', '2026-10-09T12:00:00Z');
		expect(p(d, 'per_annie').meta).toEqual({ updatedAt: '2026-10-09T12:00:00Z', updatedBy: 'me@example.com' });
		expect(p(d, 'per_george').meta).toBeUndefined();
		// A second save with nothing new doesn't move the stamp.
		const again = structuredClone(d);
		stampChanges(d, again, 'me@example.com', '2026-10-09T13:00:00Z');
		expect(p(again, 'per_annie').meta?.updatedAt).toBe('2026-10-09T12:00:00Z');
	});
});

describe('repairs after merging', () => {
	it("drops references to someone deleted on one side while the other side added to their family", () => {
		const o = base(),
			a = base(),
			b = base();
		deletePerson(a, 'per_jacques_raverat');
		ok(linkPeople(b, 'child', 'per_jacques_raverat', newPerson(b, 'Sophie Raverat').id, { famId: 'fam_raverat_darwin' }));
		const { data } = merge3(o, a, b);
		expect(person(data, 'per_jacques_raverat')).toBeUndefined();
		expect(problems(data)).toEqual([]);
		expect(data.people.some((x) => x.names?.[0]?.given === 'Sophie')).toBe(true);
	});

	it('keeps a child in one family when the two sides put them in different ones', () => {
		const o = base();
		const x = newPerson(o, 'Mystery Darwin').id;
		const a = structuredClone(o),
			b = structuredClone(o);
		fam(a, 'fam_horace_ida').children.push({ personId: x });
		fam(b, 'fam_george_maud').children.push({ personId: x });
		const { data, resolved } = merge3(o, a, b);
		expect(childIds(fam(data, 'fam_george_maud'))).toContain(x);
		expect(childIds(fam(data, 'fam_horace_ida'))).not.toContain(x);
		expect(resolved.some((c) => c.kind === 'repaired' && c.id === 'fam_horace_ida')).toBe(true);
	});

	it('keeps at most two partners in a family', () => {
		const o = base();
		const solo = newFamily(o, ['per_bessy']);
		solo.childrenComplete = 'no';
		const a = structuredClone(o),
			b = structuredClone(o);
		fam(a, solo.id).partners.push({ personId: 'per_william' });
		fam(b, solo.id).partners.push({ personId: 'per_george' });
		const { data, resolved } = merge3(o, a, b);
		expect(partnerIds(fam(data, solo.id))).toEqual(['per_bessy', 'per_george']);
		expect(resolved.some((c) => c.kind === 'repaired' && c.note?.includes('two partners'))).toBe(true);
	});
});

describe('random edits on two devices', () => {
	// Small seeded random number generator, so a failure can be reproduced.
	const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
	const pick = <T>(r: () => number, l: T[]) => l[Math.floor(r() * l.length)];
	function edit(d: Dataset, r: () => number, n: number) {
		for (let i = 0; i < n; i++) {
			const ids = d.people.map((x) => x.id);
			// Half the edits go to a few people both devices are working on, so the two sides really clash.
			const who = r() < 0.5 ? pick(r, ['per_charles', 'per_emma', 'per_annie', 'per_george'].filter((x) => ids.includes(x))) ?? pick(r, ids) : pick(r, ids);
			switch (Math.floor(r() * 10)) {
				case 0:
					linkPeople(d, pick(r, ['parent', 'partner', 'child', 'sibling'] as const), who, newPerson(d, `New ${i}`).id);
					break;
				case 1:
					linkPeople(d, pick(r, ['parent', 'partner', 'child', 'sibling'] as const), who, pick(r, ids));
					break;
				case 2:
					setLife(d, who, pick(r, ['birth', 'death'] as const), pick(r, ['1850', 'c.1851', '1860s', 'before 1900']), null);
					break;
				case 3:
					if (d.people.length > 20) deletePerson(d, who);
					break;
				case 4:
					p(d, who).notes = `note ${i}`;
					break;
				case 5:
					cite(d, who, pick(r, [...d.sources.map((s) => s.id), null]) ?? { type: 'memory', title: `Memory ${i % 3}` }, pick(r, [undefined, `p. ${i}`]));
					break;
				case 6: {
					const c = pick(r, p(d, who).citations ?? []);
					if (c && r() < 0.5) uncite(d, who, c.sourceId);
					else if (c) c.detail = `detail ${i}`;
					break;
				}
				case 7:
					setLife(d, who, pick(r, ['birth', 'death'] as const), null, pick(r, ['Shrewsbury', 'Down', 'Nowhere Green', '']));
					break;
				case 8: {
					const f = pick(r, famsAsPartner(d, who));
					const pl = pick(r, [...d.places.map((x) => x.id), null]);
					if (f) setFamilyPlace(d, f.id, pl);
					break;
				}
				default:
					p(d, who).tags = [...(p(d, who).tags ?? []), `t${i % 3}`];
			}
		}
	}
	const seen: string[] = [];
	for (let seed = 1; seed <= 25; seed++)
		it(`seed ${seed}: the merge is valid data with every reference in place`, () => {
			const r = rng(seed);
			const o = base(),
				a = structuredClone(o),
				b = structuredClone(o);
			edit(a, r, 12);
			edit(b, r, 12);
			// Half the time the devices' edits carry times (as when saved through sync), half not.
			if (seed % 2) {
				stampChanges(o, a, 'a', `2026-10-09T10:${String(seed).padStart(2, '0')}:00Z`);
				stampChanges(o, b, 'b', '2026-10-09T10:30:00Z');
			}
			const { data, resolved } = merge3(o, a, b);
			expect(problems(data)).toEqual([]);
			seen.push(...resolved.map((c) => c.kind));
		});
	it('the random edits do clash in every way', () => {
		expect(new Set(seen)).toEqual(new Set(['both-changed', 'deleted-vs-edited', 'repaired']));
	});
});

function ok(r: { error?: string } | object) {
	expect(r).not.toHaveProperty('error');
}

/** Schema errors, broken references and broken rules (one family per child, two partners at most). */
function problems(d: Dataset): string[] {
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	const validate = ajv.compile(schema);
	const out = validate(d) ? [] : (validate.errors ?? []).map((e) => `schema: ${e.instancePath} ${e.message}`);
	const people = new Set(d.people.map((x) => x.id));
	for (const f of d.families) {
		for (const id of [...partnerIds(f), ...childIds(f)]) if (!people.has(id)) out.push(`${f.id} refers to missing ${id}`);
		if (partnerIds(f).length > 2) out.push(`${f.id} has ${partnerIds(f).length} partners`);
	}
	for (const e of d.events) for (const x of e.participants) if (!people.has(x.personId)) out.push(`${e.id} refers to missing ${x.personId}`);
	const parents = new Map<string, number>();
	for (const f of d.families) for (const c of childIds(f)) parents.set(c, (parents.get(c) ?? 0) + 1);
	for (const [c, n] of parents) if (n > 1) out.push(`${c} is a child in ${n} families`);
	const media = new Set(d.media.map((m) => m.id));
	for (const x of d.people) if (x.photo && !media.has(x.photo)) out.push(`${x.id} has a missing photo`);
	const sources = new Set(d.sources.map((s) => s.id));
	for (const x of d.people) {
		const cs = (x.citations ?? []).map((c) => c.sourceId);
		for (const c of cs) if (!sources.has(c)) out.push(`${x.id} cites missing ${c}`);
		if (new Set(cs).size < cs.length) out.push(`${x.id} cites a source twice`);
	}
	const cited = new Set(d.people.flatMap((x) => (x.citations ?? []).map((c) => c.sourceId)));
	for (const s of d.sources) if (!cited.has(s.id)) out.push(`${s.id} is cited by no one`);
	const used = new Set([...d.events.flatMap((e) => (e.place ? [e.place.placeId] : [])), ...d.families.flatMap((f) => (f.relationship?.place ? [f.relationship.place.placeId] : []))]);
	for (const f of d.families) if (f.relationship?.place && !d.places.some((x) => x.id === f.relationship!.place!.placeId)) out.push(`${f.id} has a missing place`);
	for (const pl of d.places) if (!used.has(pl.id)) out.push(`${pl.id} is used by nothing`);
	return out;
}
