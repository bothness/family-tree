// The Phase C layout, checked against its rules on the sample data in the modes the app uses.
import { describe, expect, it } from 'vitest';
import sample from '../data/example-data.json';
import { migrate } from '../model/migrate.ts';
import { components } from '../model/queries.ts';
import { focusSet, type FocusOptions } from '../model/focus.ts';
import { viewMembers } from '../model/views.ts';
import { layoutTree } from './tree.ts';
import { checkLayout } from './check.ts';
import { isotonic } from './positions.ts';
import { routeConnectors } from './connectors.ts';
import { emptyDataset } from '../model/mutations.ts';
import type { Dataset } from '../model/types.ts';

const d = migrate(structuredClone(sample));
const everyone = () => components(d).map((ids) => ({ label: 'x', ids }));
const focus = (root: string, o: FocusOptions) => {
	const ids = [...focusSet(d, root, o).ids];
	return { ids, L: layoutTree(d, [{ label: '', ids }], root) };
};
const subset = (ids: string[]) => ({ ids, L: layoutTree(d, components(d, ids).map((c) => ({ label: 'x', ids: c }))) });

const cases: [string, () => { ids: string[]; L: ReturnType<typeof layoutTree> }][] = [
	['everyone', () => ({ ids: d.people.map((p) => p.id), L: layoutTree(d, everyone()) })],
	['Thomas ±2/1 with siblings', () => focus('per_thomas_smith', { up: 2, down: 1, width: 'siblings' })],
	['Thomas ±2/1 all relatives', () => focus('per_thomas_smith', { up: 2, down: 1, width: 'all' })],
	["William's descendants", () => focus('per_william_smith', { up: 0, down: Infinity, width: 'direct' })],
	["Jean's ancestors", () => focus('per_jean_hall', { up: Infinity, down: 0, width: 'direct' })],
	['Margaret 0/1', () => focus('per_margaret_smith', { up: 0, down: 1, width: 'direct' })],
	['Bridget all generations, all relatives', () => focus('per_bridget_murphy', { up: Infinity, down: Infinity, width: 'all' })],
	['Walkers tag view', () => subset(viewMembers(d, d.views.find((v) => v.id === 'view_walkers')!))],
	['hand-picked', () => subset(['per_john_smith', 'per_thomas_smith', 'per_bridget_murphy', 'per_jean_hall'])]
];

describe('tree layout rules', () => {
	for (const [name, make] of cases)
		it(name, () => {
			const { ids, L } = make();
			expect(checkLayout(d, L, ids)).toEqual([]);
		});
});

describe('tree layout specifics', () => {
	const L = layoutTree(d, everyone());
	const at = (id: string) => L.nodes.find((n) => n.id === id)!;
	const row = (id: string) => L.nodes.filter((n) => n.y === at(id).y).sort((a, b) => a.x - b.x).map((n) => n.id);

	it('puts someone with two partners between them, earliest partnership on the left', () => {
		const r = row('per_margaret_smith');
		expect(r.slice(r.indexOf('per_albert_dunn'), r.indexOf('per_albert_dunn') + 3)).toEqual(['per_albert_dunn', 'per_margaret_smith', 'per_george_hall']);
		const w = row('per_william_smith');
		expect(w.slice(w.indexOf('per_sarah_smith'), w.indexOf('per_sarah_smith') + 3)).toEqual(['per_sarah_smith', 'per_william_smith', 'per_eliza_smith']);
	});

	it('puts a single couple with the father on the left', () => expect(at('per_john_smith').x).toBeLessThan(at('per_mary_smith').x));

	it("places a partner's parents above them, on their grandparents' row", () => {
		const bridget = at('per_bridget_murphy'),
			catherine = at('per_catherine_murphy');
		expect(catherine.y).toBe(at('per_john_smith').y);
		expect(Math.abs(catherine.x - bridget.x)).toBeLessThan(400);
	});

	it('keeps the focus person at x = 0, so widening the view grows around them', () => {
		for (const width of ['direct', 'siblings', 'all'] as const) {
			const { L } = focus('per_thomas_smith', { up: 2, down: 1, width });
			const t = L.nodes.find((n) => n.id === 'per_thomas_smith')!;
			expect(t.x + 78).toBe(0);
		}
	});

	it('keys lines stably, so they can be animated', () => {
		const keys = L.lines.map((l) => l.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toContain('fam_smith_walker:couple');
	});

	it('is the same whatever order families were added in', () => {
		const shuffled = migrate(structuredClone(sample));
		shuffled.families.reverse();
		shuffled.people.reverse();
		const a = layoutTree(d, everyone()),
			b = layoutTree(shuffled, components(shuffled).map((ids) => ({ label: 'x', ids })));
		const key = (L: typeof a) => L.nodes.map((n) => `${n.id}@${Math.round(n.x)},${n.y}`).sort();
		expect(key(b)).toEqual(key(a));
	});
});

describe('isotonic', () => {
	it('keeps order and gaps while staying close to the wanted positions', () => {
		expect(isotonic([{ x: 0, wt: 1 }, { x: 0, wt: 1 }], [10])).toEqual([-5, 5]);
		expect(isotonic([{ x: 0, wt: 1 }, { x: 100, wt: 1 }], [10])).toEqual([0, 100]);
	});
});

describe('sibling sets either side of a couple (V8)', () => {
	// Husband (b.1878) with an older brother and a younger sister; wife with a sister; both sets of parents in view;
	// some of the husband's siblings are missing.
	const d2: Dataset = emptyDataset();
	const P = (id: string, sex: 'M' | 'F', born: string) => {
		d2.people.push({ id, names: [{ given: id }], sex: { value: sex } });
		d2.events.push({ id: `b_${id}`, type: 'birth', date: { edtf: born }, participants: [{ personId: id }] });
	};
	P('hf', 'M', '1850'); P('hm', 'F', '1852'); P('wf', 'M', '1851'); P('wm', 'F', '1853');
	P('older', 'M', '1875'); P('husband', 'M', '1878'); P('younger', 'F', '1882'); P('wife', 'F', '1880'); P('sister', 'F', '1884');
	const kids = (...ids: string[]) => ids.map((personId) => ({ personId }));
	d2.families.push(
		{ id: 'f_h', partners: kids('hf', 'hm'), children: kids('older', 'husband', 'younger'), childrenComplete: 'no' },
		{ id: 'f_w', partners: kids('wf', 'wm'), children: kids('wife', 'sister') },
		{ id: 'f_hw', partners: kids('husband', 'wife'), children: [] }
	);
	const L = layoutTree(d2, components(d2).map((ids) => ({ label: '', ids })));
	const row = (y: number) =>
		[...L.nodes.filter((n) => n.y === y).map((n) => [n.id, n.x] as const), ...L.ghosts.filter((g) => g.y === y).map((g) => [`+${g.familyId}`, g.x] as const)]
			.sort((a, b) => a[1] - b[1])
			.map((x) => x[0]);

	it('passes the layout rules', () => expect(checkLayout(d2, L, d2.people.map((p) => p.id))).toEqual([]));
	it("puts each partner's family on their side, the married child at the edge facing their spouse", () => {
		expect(row(0)).toEqual(['hf', 'hm', 'wf', 'wm']);
		expect(row(L.nodes.find((n) => n.id === 'husband')!.y)).toEqual(['+f_h', 'older', 'younger', 'husband', 'wife', 'sister']);
	});
	it('also works in a focus view on the wife', () => {
		const ids = [...focusSet(d2, 'wife', { up: 1, down: 0, width: 'siblings' }).ids];
		expect(checkLayout(d2, layoutTree(d2, [{ label: '', ids }], 'wife'), ids)).toEqual([]);
	});
});

describe('connectors', () => {
	// Two families on the same rows: A's children far apart, B's single child under B. B's line down crosses A's.
	const d3: Dataset = emptyDataset();
	for (const id of ['a1', 'a2', 'ac1', 'ac2', 'b', 'bc']) d3.people.push({ id, names: [{ given: id }] });
	d3.families.push(
		{ id: 'fa', partners: [{ personId: 'a1' }, { personId: 'a2' }], children: [{ personId: 'ac1' }, { personId: 'ac2' }] },
		{ id: 'fb', partners: [{ personId: 'b' }], children: [{ personId: 'bc' }] }
	);
	const nodes = [
		{ id: 'a1', x: 0, y: 0 }, { id: 'a2', x: 170, y: 0 }, { id: 'b', x: 400, y: 0 },
		{ id: 'ac1', x: 0, y: 142 }, { id: 'bc', x: 420, y: 142 }, { id: 'ac2', x: 600, y: 142 }
	];
	const { lines, anchors } = routeConnectors(d3, nodes, []);
	const line = (k: string) => lines.find((l) => l.key === k)!;

	it('puts overlapping families at different heights', () => {
		expect(line('fa:bus').seg.y1).not.toBe(line('fb:bus').seg.y1);
	});
	it('hops where a line crosses another family\'s', () => {
		const crossing = [line('fb:drop'), line('fb:c:bc')].find((v) => v.seg.x1 > line('fa:bus').seg.x1 && v.seg.x1 < line('fa:bus').seg.x2 && Math.min(v.seg.y1, v.seg.y2) < line('fa:bus').seg.y1 && Math.max(v.seg.y1, v.seg.y2) > line('fa:bus').seg.y1);
		expect(crossing).toBeDefined();
		expect(line('fa:bus').hops).toContain(crossing!.seg.x1);
		expect(line('fa:bus').d).toMatch(/A5 5 0 0 1/);
	});
	it('anchors a couple at the middle of their line, a lone parent below their card', () => {
		expect(anchors.fa).toMatchObject({ x: 163, couple: true });
		expect(anchors.fb).toMatchObject({ x: 478, couple: false });
	});
});
