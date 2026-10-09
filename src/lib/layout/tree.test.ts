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

	it("gives overlapping families' lines separate heights, with a hop where one crosses the other", () => {
		const bus = (fid: string) => L.lines.find((l) => l.key === `${fid}:bus`)!;
		const smith = bus('fam_smith_walker'),
			murphy = L.lines.find((l) => l.key === 'fam_murphy:c:per_bridget_murphy')!;
		// The Murphys' line down to Bridget crosses John and Mary's line to their children.
		expect(murphy.seg.y1).not.toBe(smith.seg.y1);
		expect(murphy.seg.x1).toBeGreaterThan(smith.seg.x1);
		expect(murphy.seg.x1).toBeLessThan(smith.seg.x2);
		expect(smith.hops.some((x) => Math.abs(x - murphy.seg.x1) < 1)).toBe(true);
		expect(smith.d).toContain('A');
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
