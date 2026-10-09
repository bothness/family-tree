import { describe, expect, it } from 'vitest';
import type { Dataset, Family } from './types.ts';
import { emptyDataset } from './mutations.ts';
import { expandToInclude, focusSet, type FocusOptions } from './focus.ts';

// Grandparents gf + gm → dad, aunt.  mgf (placeholder, alone) → mum.
// dad + mum → me, sis.  dad + mum2 → halfbro.  aunt + uncle → cousin.  cousin + cspouse → ckid.
// me + spouse → kid.  kid + kspouse → gkid.  spouse + ex → stepkid (spouse's child from another relationship).
function tree(): Dataset {
	const d = emptyDataset();
	const ids = 'gf gm mgf dad mum mum2 aunt uncle me sis halfbro cousin cspouse ckid spouse ex stepkid kid kspouse gkid'.split(' ');
	d.people = ids.map((id) => ({ id, names: [{ given: id }], ...(id === 'mgf' ? { placeholder: true } : {}) }));
	const fam = (id: string, partners: string[], children: string[]): Family => ({
		id,
		partners: partners.map((personId) => ({ personId })),
		children: children.map((personId) => ({ personId }))
	});
	d.families = [
		fam('f_gp', ['gf', 'gm'], ['dad', 'aunt']),
		fam('f_mgf', ['mgf'], ['mum']),
		fam('f_parents', ['dad', 'mum'], ['me', 'sis']),
		fam('f_dad2', ['dad', 'mum2'], ['halfbro']),
		fam('f_aunt', ['aunt', 'uncle'], ['cousin']),
		fam('f_cousin', ['cousin', 'cspouse'], ['ckid']),
		fam('f_me', ['me', 'spouse'], ['kid']),
		fam('f_spouse_ex', ['spouse', 'ex'], ['stepkid']),
		fam('f_kid', ['kid', 'kspouse'], ['gkid'])
	];
	return d;
}

const d = tree();
const shown = (o: FocusOptions, root = 'me') => [...focusSet(d, root, o).ids].sort();
const edges = (o: FocusOptions, root = 'me') => focusSet(d, root, o).edges;

describe('focusSet: direct line', () => {
	it('shows ancestors, descendants and their partners, but no siblings', () => {
		expect(shown({ up: 1, down: 1, width: 'direct' })).toEqual(['dad', 'kid', 'kspouse', 'me', 'mum', 'spouse'].sort());
	});

	it('stops at the depth limits', () => {
		expect(shown({ up: 2, down: 2, width: 'direct' })).toEqual(['dad', 'gf', 'gkid', 'gm', 'kid', 'kspouse', 'me', 'mgf', 'mum', 'spouse'].sort());
	});

	it('with no generations either way shows just the person, without partners (collapse)', () => {
		for (const width of ['direct', 'siblings', 'all'] as const) expect(shown({ up: 0, down: 0, width })).toEqual(['me']);
		expect(edges({ up: 0, down: 0, width: 'direct' })).toEqual([
			{ dir: 'up', personId: 'me', hidden: 2 },
			{ dir: 'down', familyId: 'f_me', hidden: 1 }
		]);
	});

	it('shows partners again as soon as there is a generation either way', () => {
		expect(shown({ up: 1, down: 0, width: 'direct' })).toContain('spouse');
		expect(shown({ up: 0, down: 1, width: 'direct' })).toContain('spouse');
	});

	it("never follows a partner's other relationships (no step-children)", () => {
		expect(shown({ up: 0, down: 3, width: 'all' })).not.toContain('stepkid');
		expect(shown({ up: 0, down: 3, width: 'all' })).not.toContain('ex');
	});
});

describe('focusSet: siblings', () => {
	it('adds siblings and half-siblings, with the half-sibling’s other parent', () => {
		const s = shown({ up: 1, down: 0, width: 'siblings' });
		expect(s).toEqual(expect.arrayContaining(['sis', 'halfbro', 'mum2']));
		expect(s).not.toContain('aunt');
	});

	it('adds aunts and uncles once grandparents are in view, but not their partners or children', () => {
		const s = shown({ up: 2, down: 0, width: 'siblings' });
		expect(s).toContain('aunt');
		expect(s).not.toContain('uncle');
		expect(s).not.toContain('cousin');
	});

	it('shows no siblings when parents are out of view', () => {
		expect(shown({ up: 0, down: 1, width: 'siblings' })).not.toContain('sis');
	});
});

describe('focusSet: all relatives', () => {
	it('adds cousins (and their parents and partners) only when the shared grandparents are in view', () => {
		expect(shown({ up: 1, down: 0, width: 'all' })).not.toContain('cousin');
		const s = shown({ up: 2, down: 0, width: 'all' });
		expect(s).toEqual(expect.arrayContaining(['aunt', 'uncle', 'cousin', 'cspouse']));
	});

	it("goes no deeper than the focus person's own descendants", () => {
		expect(shown({ up: 2, down: 0, width: 'all' })).not.toContain('ckid');
		expect(shown({ up: 2, down: 1, width: 'all' })).toContain('ckid');
	});
});

describe('focusSet: edges', () => {
	it('marks people whose parents are just out of view, counting hidden parents', () => {
		expect(edges({ up: 1, down: 0, width: 'direct' }).filter((e) => e.dir === 'up')).toEqual([
			{ dir: 'up', personId: 'dad', hidden: 2 },
			{ dir: 'up', personId: 'mum', hidden: 1 }
		]);
	});

	it('marks families whose children are just out of view', () => {
		expect(edges({ up: 0, down: 1, width: 'direct' }).filter((e) => e.dir === 'down')).toEqual([{ dir: 'down', familyId: 'f_kid', hidden: 1 }]);
		expect(edges({ up: 0, down: 0, width: 'direct' }).filter((e) => e.dir === 'down')).toEqual([{ dir: 'down', familyId: 'f_me', hidden: 1 }]);
	});

	it("marks cousins' children only when showing all relatives", () => {
		const fams = (o: FocusOptions) => edges(o).flatMap((e) => (e.dir === 'down' ? [e.familyId] : []));
		expect(fams({ up: 2, down: 0, width: 'all' })).toContain('f_cousin');
		expect(fams({ up: 2, down: 0, width: 'siblings' })).not.toContain('f_cousin');
	});

	it('has no edges at the top of the recorded tree', () => {
		expect(edges({ up: 2, down: 2, width: 'direct' })).toEqual([]);
	});

	it('returns nothing for an unknown person', () => {
		expect(focusSet(d, 'nobody', { up: 1, down: 1, width: 'all' })).toEqual({ ids: new Set(), edges: [], reach: { up: 0, down: 0 } });
	});

	it('reports how far the direct line actually reaches', () => {
		expect(focusSet(d, 'me', { up: Infinity, down: Infinity, width: 'all' }).reach).toEqual({ up: 2, down: 2 });
		expect(focusSet(d, 'me', { up: 1, down: 0, width: 'direct' }).reach).toEqual({ up: 1, down: 0 });
	});
});

describe('expandToInclude', () => {
	const ex = (o: FocusOptions, id: string) => expandToInclude(d, 'me', o, id);

	it('leaves the view alone when the person is already in it', () => {
		expect(ex({ up: 1, down: 1, width: 'direct' }, 'dad')).toEqual({ up: 1, down: 1, width: 'direct' });
	});

	it('adds generations for ancestors and descendants', () => {
		expect(ex({ up: 1, down: 1, width: 'direct' }, 'gf')).toEqual({ up: 2, down: 1, width: 'direct' });
		expect(ex({ up: 0, down: 0, width: 'direct' }, 'gkid')).toEqual({ up: 0, down: 2, width: 'direct' });
	});

	it('widens for siblings, and for a sibling’s children', () => {
		expect(ex({ up: 1, down: 1, width: 'direct' }, 'sis')).toEqual({ up: 1, down: 1, width: 'siblings' });
		expect(ex({ up: 2, down: 0, width: 'siblings' }, 'cousin')).toEqual({ up: 2, down: 0, width: 'all' });
	});

	it('combines both when needed (a cousin from a direct-line view of parents only)', () => {
		expect(ex({ up: 1, down: 1, width: 'direct' }, 'cousin')).toEqual({ up: 2, down: 1, width: 'all' });
	});

	it("returns null for people no focus on this person can include (a partner's other family)", () => {
		expect(ex({ up: 1, down: 1, width: 'direct' }, 'stepkid')).toBeNull();
	});
});
