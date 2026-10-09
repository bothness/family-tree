import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../schema/family-tree.schema.json';
import demo from '../data/demo-darwin.json';
import type { Dataset } from '../model/types.ts';
import { deletePerson, emptyDataset, linkPeople, newFamily, newPerson, setLife } from '../model/mutations.ts';
import { childIds, partnerIds, person } from '../model/queries.ts';
import { choose, eq, merge3, normalise } from './merge.ts';

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
		expect(merge3(o, x, x).conflicts).toEqual([]);
	});

	it('takes edits to different people from both sides without conflict', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').notes = 'Edited here';
		p(b, 'per_george').notes = 'Edited there';
		const { data, conflicts } = merge3(o, a, b);
		expect(conflicts).toEqual([]);
		expect(p(data, 'per_annie').notes).toBe('Edited here');
		expect(p(data, 'per_george').notes).toBe('Edited there');
	});

	it('takes edits to different fields of the same person', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').notes = 'Edited here';
		p(b, 'per_annie').knownAs = 'Annie';
		const { data, conflicts } = merge3(o, a, b);
		expect(conflicts).toEqual([]);
		expect(p(data, 'per_annie')).toMatchObject({ notes: 'Edited here', knownAs: 'Annie' });
	});

	it('keeps different children added to the same family on both sides', () => {
		const o = base(),
			a = base(),
			b = base();
		ok(linkPeople(a, 'child', 'per_gwen', newPerson(a, 'Elisabeth Raverat').id, { famId: 'fam_raverat_darwin' }));
		ok(linkPeople(b, 'child', 'per_gwen', newPerson(b, 'Sophie Raverat').id, { famId: 'fam_raverat_darwin' }));
		const { data, conflicts } = merge3(o, a, b);
		expect(conflicts).toEqual([]);
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
		const { data, conflicts } = merge3(o, a, b);
		expect(conflicts).toEqual([]);
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
		const { data, conflicts } = merge3(o, a, b);
		expect(conflicts).toEqual([]);
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

describe('conflicts', () => {
	it('records the same field changed differently, keeps this side, and can switch to theirs', () => {
		const o = base(),
			a = base(),
			b = base();
		setLife(a, 'per_annie', 'birth', '1841', null);
		setLife(b, 'per_annie', 'birth', 'c.1840', null);
		const { data, conflicts } = merge3(o, a, b);
		expect(conflicts).toHaveLength(1);
		const c = conflicts[0];
		expect(c).toMatchObject({ kind: 'both-changed', collection: 'events', id: 'evt_birth_annie', path: ['date', 'edtf'], local: '1841', remote: '1840~', kept: 'local' });
		const birth = () => data.events.find((e) => e.id === 'evt_birth_annie')!.date!.edtf;
		expect(birth()).toBe('1841');
		const c2 = choose(data, c, 'remote');
		expect(birth()).toBe('1840~');
		choose(data, c2, 'local');
		expect(birth()).toBe('1841');
	});

	it('treats a list of names as one value', () => {
		const o = base(),
			a = base(),
			b = base();
		p(a, 'per_annie').names![0].given = 'Anne';
		p(b, 'per_annie').names!.push({ type: 'alias', given: 'Annie' });
		const { conflicts } = merge3(o, a, b);
		expect(conflicts.map((c) => [c.kind, c.id, c.path])).toEqual([['both-changed', 'per_annie', ['names']]]);
	});

	it('keeps someone deleted on one side but edited on the other, and says so', () => {
		const o = base(),
			a = base(),
			b = base();
		deletePerson(a, 'per_maud');
		p(b, 'per_maud').notes = 'Found her birth certificate';
		const { data, conflicts } = merge3(o, a, b);
		expect(p(data, 'per_maud').notes).toBe('Found her birth certificate');
		expect(conflicts.some((c) => c.kind === 'deleted-vs-edited' && c.id === 'per_maud' && c.kept === 'remote')).toBe(true);
		// Choosing this side's deletion removes her, and tidies away anything that pointed at her.
		const c = conflicts.find((c) => c.id === 'per_maud' && c.kind === 'deleted-vs-edited')!;
		choose(data, c, 'local');
		expect(person(data, 'per_maud')).toBeUndefined();
		expect(data.families.some((f) => partnerIds(f).includes('per_maud') || childIds(f).includes('per_maud'))).toBe(false);
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
		const { data, conflicts } = merge3(o, a, b);
		expect(childIds(fam(data, 'fam_george_maud'))).toContain(x);
		expect(childIds(fam(data, 'fam_horace_ida'))).not.toContain(x);
		expect(conflicts.some((c) => c.kind === 'repaired' && c.id === 'fam_horace_ida')).toBe(true);
	});

	it('keeps at most two partners in a family', () => {
		const o = base();
		const solo = newFamily(o, ['per_bessy']);
		solo.childrenComplete = 'no';
		const a = structuredClone(o),
			b = structuredClone(o);
		fam(a, solo.id).partners.push({ personId: 'per_william' });
		fam(b, solo.id).partners.push({ personId: 'per_george' });
		const { data, conflicts } = merge3(o, a, b);
		expect(partnerIds(fam(data, solo.id))).toEqual(['per_bessy', 'per_george']);
		expect(conflicts.some((c) => c.kind === 'repaired' && c.note?.includes('two partners'))).toBe(true);
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
			switch (Math.floor(r() * 6)) {
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
			const { data, conflicts } = merge3(o, a, b);
			expect(problems(data)).toEqual([]);
			// Taking the other side for every conflict also leaves valid data.
			for (const c of conflicts) choose(data, c, c.kept === 'local' ? 'remote' : 'local');
			expect(problems(data)).toEqual([]);
			seen.push(...conflicts.map((c) => c.kind));
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
	return out;
}
