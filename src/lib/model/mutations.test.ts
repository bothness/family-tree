import { beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from './types.ts';
import { deletePerson, emptyDataset, linkPeople, newPerson, setChildOf, setLife } from './mutations.ts';
import { childIds, coupleFam, displayName, famAsChild, halfSiblings, partnerIds, soloFam } from './queries.ts';

let d: Dataset;
const mk = (name: string) => newPerson(d, name).id;
const ok = (r: ReturnType<typeof linkPeople>) => expect('error' in r ? r.error : null).toBeNull();

beforeEach(() => {
	d = emptyDataset();
});

describe('newPerson', () => {
	it('splits the last word off as the surname', () => {
		const p = newPerson(d, 'Mary Ann Smith');
		expect(p.names?.[0]).toMatchObject({ given: 'Mary Ann', surname: 'Smith' });
	});
	it('allows an unnamed person', () => {
		expect(newPerson(d, '').names).toEqual([]);
	});
});

describe('linkPeople', () => {
	it('siblings share parents by default', () => {
		const tom = mk('Tom Smith'), ann = mk('Ann Smith'), john = mk('John Smith');
		ok(linkPeople(d, 'sibling', tom, ann));
		const r = linkPeople(d, 'parent', tom, john);
		ok(r);
		expect(partnerIds(famAsChild(d, ann)!)).toEqual([john]);
		expect('info' in r && r.info).toMatch(/sibling/);
	});

	it('refuses a third parent', () => {
		const c = mk('C'), a = mk('A'), b = mk('B'), x = mk('X');
		linkPeople(d, 'parent', c, a);
		linkPeople(d, 'parent', c, b);
		expect(linkPeople(d, 'parent', c, x)).toHaveProperty('error');
	});

	it('reuses an existing couple instead of creating a duplicate', () => {
		const john = mk('John'), mary = mk('Mary'), tom = mk('Tom'), ann = mk('Ann');
		linkPeople(d, 'partner', john, mary);
		linkPeople(d, 'child', john, tom);
		linkPeople(d, 'parent', ann, john); // Ann: John + unknown
		linkPeople(d, 'parent', ann, mary); // ...then Mary → should join the existing John & Mary family
		expect(famAsChild(d, ann)).toBe(famAsChild(d, tom));
		expect(d.families.filter((f) => partnerIds(f).includes(john))).toHaveLength(1);
	});

	it("links a new partner to a single parent's children when chosen", () => {
		const john = mk('John'), ann = mk('Ann'), sarah = mk('Sarah');
		linkPeople(d, 'child', john, ann);
		expect(soloFam(d, john)).toBeTruthy();
		ok(linkPeople(d, 'partner', john, sarah, { kids: [ann] }));
		expect(partnerIds(famAsChild(d, ann)!).sort()).toEqual([john, sarah].sort());
		expect(soloFam(d, john)).toBeUndefined();
	});

	it('keeps children with the unknown parent when not chosen', () => {
		const john = mk('John'), ann = mk('Ann'), sarah = mk('Sarah');
		linkPeople(d, 'child', john, ann);
		linkPeople(d, 'partner', john, sarah, { kids: [] });
		expect(partnerIds(famAsChild(d, ann)!)).toEqual([john]);
		expect(coupleFam(d, john, sarah)).toBeTruthy();
	});

	it('moves an existing child and reports it', () => {
		const a = mk('A'), b = mk('B'), c = mk('C');
		linkPeople(d, 'child', a, c);
		const r = linkPeople(d, 'child', b, c);
		expect(partnerIds(famAsChild(d, c)!)).toEqual([b]);
		expect(r).toHaveProperty('info');
		expect(d.families.some((f) => partnerIds(f).includes(a))).toBe(false); // empty solo family pruned
	});

	it('joining a parentless sibling to a sibling with parents moves the parentless one', () => {
		const tom = mk('Tom'), ann = mk('Ann'), john = mk('John');
		linkPeople(d, 'child', john, ann);
		ok(linkPeople(d, 'sibling', tom, ann));
		expect(partnerIds(famAsChild(d, tom)!)).toEqual([john]);
	});

	it('rejects linking someone to themselves', () => {
		const a = mk('A');
		expect(linkPeople(d, 'partner', a, a)).toHaveProperty('error');
	});
});

describe('half-siblings via setChildOf', () => {
	it('moves a child to "father + unknown other parent"', () => {
		const john = mk('John'), mary = mk('Mary'), tom = mk('Tom'), ann = mk('Ann');
		linkPeople(d, 'partner', john, mary);
		linkPeople(d, 'child', john, tom);
		linkPeople(d, 'child', john, ann);
		setChildOf(d, ann, `solo:${john}`);
		expect(partnerIds(famAsChild(d, ann)!)).toEqual([john]);
		expect(halfSiblings(d, tom)).toEqual([ann]);
		expect(halfSiblings(d, ann)).toEqual([tom]);
	});
	it('"none" removes recorded parents', () => {
		const a = mk('A'), c = mk('C');
		linkPeople(d, 'child', a, c);
		setChildOf(d, c, 'none');
		expect(famAsChild(d, c)).toBeUndefined();
	});
});

describe('setLife and deletePerson', () => {
	it('creates, updates and removes a birth event', () => {
		const a = mk('A');
		setLife(d, a, 'birth', 'c.1858', 'Leeds');
		expect(d.events[0]).toMatchObject({ type: 'birth', date: { edtf: '1858~' } });
		expect(d.places[0].name).toBe('Leeds');
		setLife(d, a, 'birth', '', '');
		expect(d.events).toHaveLength(0);
	});
	it('removes a person from families and events', () => {
		const a = mk('A'), b = mk('B'), c = mk('C');
		linkPeople(d, 'partner', a, b);
		linkPeople(d, 'child', a, c);
		setLife(d, c, 'birth', '1900', null);
		deletePerson(d, c);
		expect(d.people.map((p) => p.id)).not.toContain(c);
		expect(d.events).toHaveLength(0);
		expect(childIds(coupleFam(d, a, b)!)).toEqual([]);
	});
});

describe('displayName', () => {
	it('uses "known as" with the surname', () => {
		const p = newPerson(d, 'Ann Smith');
		p.knownAs = 'Annie';
		expect(displayName(p)).toBe('Annie Smith');
		p.knownAs = 'Nan Jones';
		expect(displayName(p)).toBe('Nan Jones');
	});
});
