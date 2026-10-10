// The Phase C layout, checked against its rules on the sample data in the modes the app uses.
import { describe, expect, it } from 'vitest';
import sample from '../data/example-data.json';
import demo from '../data/demo-darwin.json';
import { migrate } from '../model/migrate.ts';
import { components } from '../model/queries.ts';
import { focusSet, type FocusOptions } from '../model/focus.ts';
import { viewMembers } from '../model/views.ts';
import { cardSize, layoutTree, sideways, turn, NODE_W, PORTRAIT_H, PORTRAIT_NOPHOTO_H, PORTRAIT_W, type CardSize } from './tree.ts';
import { checkLayout, crossings } from './check.ts';
import { isotonic, PHOTO_W } from './positions.ts';
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
	['everyone, wider cards with photos', () => ({ ids: d.people.map((p) => p.id), L: layoutTree(d, everyone(), undefined, PHOTO_W) })],
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

describe('sibling sets either side of a couple (V8), in strict age order', () => {
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
	it("keeps strict age order, with the spouse's brothers and sisters beyond the other family's children", () => {
		process.stdout.write(JSON.stringify([row(0), row(L.nodes.find((n) => n.id === 'husband')!.y)]) + '\n');
		expect(row(0)).toEqual(['hf', 'hm', 'wf', 'wm']);
		expect(row(L.nodes.find((n) => n.id === 'husband')!.y)).toEqual(['older', 'husband', 'wife', 'younger', '+f_h', 'sister']);
	});
	it('also works in a focus view on the wife', () => {
		const ids = [...focusSet(d2, 'wife', { up: 1, down: 0, width: 'siblings' }).ids];
		expect(checkLayout(d2, layoutTree(d2, [{ label: '', ids }], 'wife'), ids)).toEqual([]);
	});
});

describe('brothers and sisters whose parents are not in view', () => {
	// A grandson marries a woman whose only relative in view is her older sister (their parents aren't). The wife
	// is placed late, as an in-law; the sister, with no other family, used to stay where she was first put, far
	// along the row (from a real tree). The grandfather's second family is what pushed her out.
	const d4: Dataset = emptyDataset();
	const P = (id: string, sex: 'M' | 'F', born: string) => {
		d4.people.push({ id, names: [{ given: id }], sex: { value: sex } });
		d4.events.push({ id: `b_${id}`, type: 'birth', date: { edtf: born }, participants: [{ personId: id }] });
	};
	P('grandad', 'M', '1926'); P('grandma', 'F', '1928'); P('dad', 'M', '1953'); P('uncle1', 'M', '1972'); P('uncle2', 'M', '1974');
	P('son', 'M', '1982'); P('wife', 'F', '1972'); P('sister', 'F', '1971');
	const kids = (...ids: string[]) => ids.map((personId) => ({ personId }));
	d4.families.push(
		{ id: 'f_a', partners: kids('grandad', 'grandma'), children: kids('dad') },
		{ id: 'f_b', partners: kids('grandad'), children: kids('uncle1', 'uncle2') },
		{ id: 'f_dad', partners: kids('dad'), children: kids('son') },
		{ id: 'f_sw', partners: kids('son', 'wife'), children: [] },
		{ id: 'f_sisters', partners: [], children: kids('wife', 'sister') }
	);
	const L = layoutTree(d4, components(d4).map((ids) => ({ label: '', ids })));
	it('puts the sister right beside the couple, on the older side', () => {
		const y = L.nodes.find((n) => n.id === 'wife')!.y;
		const row = L.nodes.filter((n) => n.y === y).sort((a, b) => a.x - b.x).map((n) => n.id);
		expect(row.slice(row.indexOf('sister'), row.indexOf('sister') + 3)).toEqual(['sister', 'son', 'wife']);
		const at = (id: string) => L.nodes.find((n) => n.id === id)!.x;
		expect(at('son') - at('sister')).toBeLessThanOrEqual(NODE_W + 44);
	});
	it('passes the layout rules', () => expect(checkLayout(d4, L, d4.people.map((p) => p.id))).toEqual([]));
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

describe('siblings with no parents recorded', () => {
	const d4: Dataset = emptyDataset();
	d4.people.push({ id: 'ann', names: [{ given: 'Ann' }] }, { id: 'bob', names: [{ given: 'Bob' }] });
	d4.families.push({ id: 'sibs', partners: [], children: [{ personId: 'ann' }, { personId: 'bob' }] });
	it('lays out a focus on one of them, with the other beside them joined by a line', () => {
		const ids = [...focusSet(d4, 'ann', { up: 1, down: 1, width: 'siblings' }).ids];
		const L = layoutTree(d4, [{ label: '', ids }], 'ann');
		expect(ids.sort()).toEqual(['ann', 'bob']);
		expect(checkLayout(d4, L, ids)).toEqual([]);
		expect(L.lines.some((l) => l.key === 'sibs:bus')).toBe(true);
	});
});

// The demo family (E4): cousin marriages join the Darwins and Wedgwoods twice over, and several people remarried.
describe('tree layout rules on the Darwin–Wedgwood demo', () => {
	const dd = migrate(structuredClone(demo));
	const at = (root: string, o: FocusOptions) => {
		const ids = [...focusSet(dd, root, o).ids];
		return { ids, L: layoutTree(dd, [{ label: '', ids }], root) };
	};
	const demoCases: [string, () => { ids: string[]; L: ReturnType<typeof layoutTree> }][] = [
		['everyone', () => ({ ids: dd.people.map((p) => p.id), L: layoutTree(dd, components(dd).map((ids) => ({ label: 'x', ids }))) })],
		["Charles's family view", () => at('per_charles', { up: 2, down: 1, width: 'direct' })],
		['Descendants of Erasmus', () => at('per_erasmus', { up: 0, down: Infinity, width: 'direct' })],
		['Francis (three marriages) all relatives', () => at('per_francis', { up: 1, down: 1, width: 'all' })],
		['Elizabeth Collier ±1 all relatives', () => at('per_elizabeth_collier', { up: 1, down: 1, width: 'all' })],
		['Ralph Vaughan Williams ancestors', () => at('per_ralph_vw', { up: Infinity, down: 0, width: 'direct' })]
	];
	for (const [name, make] of demoCases)
		it(name, () => {
			const { ids, L } = make();
			expect(checkLayout(dd, L, ids)).toEqual([]);
		});
});

// Vertical trees with narrow cards (V13) and horizontal (left-to-right) trees (V14), checked against the same rules. A left-to-right
// tree is worked out on its side and then flipped, so its rules are checked before the flip.
describe('tree layout rules, vertical (narrow cards) and horizontal', () => {
	const dd = migrate(structuredClone(demo) as unknown as Dataset);
	const sizes: [string, CardSize][] = [
		['vertical, photos', cardSize(PORTRAIT_W, PORTRAIT_H)],
		['vertical, no photos', cardSize(PORTRAIT_W, PORTRAIT_NOPHOTO_H)],
		['horizontal, photos', turn(cardSize(PHOTO_W))],
		['horizontal, no photos', turn(cardSize(NODE_W))]
	];
	for (const [mode, S] of sizes)
		for (const [data, name, root, o] of [
			[d, 'Smiths, everyone', undefined, undefined],
			[d, 'Thomas ±2/1 all relatives', 'per_thomas_smith', { up: 2, down: 1, width: 'all' }],
			[dd, 'Darwins, everyone', undefined, undefined],
			[dd, "Charles's family", 'per_charles', { up: 2, down: 1, width: 'direct' }],
			[dd, 'Francis all relatives', 'per_francis', { up: 1, down: 1, width: 'all' }]
		] as [Dataset, string, string | undefined, FocusOptions | undefined][])
			it(`${mode}: ${name}`, () => {
				const ids = root ? [...focusSet(data, root, o!).ids] : data.people.map((p) => p.id);
				const branches = root ? [{ label: '', ids }] : components(data).map((c) => ({ label: 'x', ids: c }));
				expect(checkLayout(data, sideways(data, branches, root, S), ids)).toEqual([]);
			});

	it('a left-to-right tree is the sideways layout flipped across the diagonal', () => {
		const S = cardSize(PHOTO_W);
		const across = layoutTree(dd, [{ label: '', ids: dd.people.map((p) => p.id) }], 'per_charles', S, true);
		const side = sideways(dd, [{ label: '', ids: dd.people.map((p) => p.id) }], 'per_charles', turn(S));
		const a = across.nodes.find((n) => n.id === 'per_charles')!,
			b = side.nodes.find((n) => n.id === 'per_charles')!;
		expect([a.x, a.y]).toEqual([b.y, b.x]);
		// Generations run across: parents to the left of their children.
		const robert = across.nodes.find((n) => n.id === 'per_robert')!;
		expect(robert.x).toBeLessThan(a.x);
		expect(across.lines.every((l) => l.seg.x1 === l.seg.x2 || l.seg.y1 === l.seg.y2)).toBe(true);
	});
});

describe('lines that would run along each other', () => {
	// Couple A's line down to their child, and single parent B's line to their child, at the same x in the same gap.
	const d4: Dataset = emptyDataset();
	for (const id of ['a1', 'a2', 'ac', 'b', 'bc']) d4.people.push({ id, names: [{ given: id }] });
	d4.families.push(
		{ id: 'fa', partners: [{ personId: 'a1' }, { personId: 'a2' }], children: [{ personId: 'ac' }] },
		{ id: 'fb', partners: [{ personId: 'b' }], children: [{ personId: 'bc' }] }
	);
	// A's anchor (the middle of the gap between a1 and a2) is at 0 + 156 + 7 = 163: exactly above bc's centre.
	const nodes = [
		{ id: 'a1', x: 0, y: 0 }, { id: 'a2', x: 170, y: 0 }, { id: 'b', x: 400, y: 0 },
		{ id: 'ac', x: 600, y: 142 }, { id: 'bc', x: 163 - 78, y: 142 }
	];
	const L = { ...routeConnectors(d4, nodes, []), nodes, ghosts: [], labels: [], bounds: { x: 0, y: 0, w: 0, h: 0 }, cardW: 156, size: cardSize() };
	it("moves the child's line along their card, clear of the other family's", () => {
		const stub = L.lines.find((l) => l.key === 'fb:c:bc')!;
		expect(Math.abs(stub.seg.x1 - L.anchors.fa.x)).toBeGreaterThanOrEqual(10);
		expect(stub.seg.x1).toBeGreaterThan(85 + 11);
		expect(stub.seg.x1).toBeLessThan(85 + 156 - 11);
		expect(checkLayout(d4, L as never, d4.people.map((p) => p.id)).filter((m) => m.includes('run along'))).toEqual([]);
	});
});

describe('fewer crossings', () => {
	// The shape that showed the problem (made-up names): a man with two partners (an older son by the first, two
	// younger sons by the second); the older son marries the eldest of another family's three; that couple's son
	// (one of three) marries into a third family. The rules alone put the in-laws between the half-brothers, then the third family
	// between them too.
	const d5: Dataset = emptyDataset();
	const P = (id: string, sex: 'M' | 'F', born?: string) => {
		d5.people.push({ id, names: [{ given: id }], sex: { value: sex } });
		if (born) d5.events.push({ id: `b_${id}`, type: 'birth', date: { edtf: born }, participants: [{ personId: id }] });
	};
	for (const [id, sex, born] of [
		['first', 'F', undefined], ['man', 'M', undefined], ['second', 'F', undefined], ['inlawDad', 'M', undefined], ['inlawMum', 'F', undefined],
		['son', 'M', '1953'], ['bride', 'F', '1948'], ['brideSis', 'F', '1951'], ['brideBro', 'M', '1953'], ['half1', 'M', '1972'], ['half2', 'M', '1976'],
		['thirdDad', 'M', '1939'], ['thirdMum', 'F', '1950'], ['gs1', 'M', '1979'], ['grandson', 'M', '1982'], ['gd3', 'F', '1985'],
		['wife3', 'F', '1972'], ['sis3', 'F', '1971'], ['bro3', 'M', '1974']
	] as const)
		P(id, sex, born);
	const k = (...ids: string[]) => ids.map((personId) => ({ personId }));
	d5.families.push(
		{ id: 'f1', partners: k('man', 'first'), relationship: { type: 'marriage', start: { edtf: '1950' } }, children: k('son') },
		{ id: 'f2', partners: k('man', 'second'), relationship: { type: 'marriage', start: { edtf: '1970' } }, children: k('half1', 'half2') },
		{ id: 'fi', partners: k('inlawDad', 'inlawMum'), children: k('bride', 'brideSis', 'brideBro') },
		{ id: 'fs', partners: k('son', 'bride'), children: k('gs1', 'grandson', 'gd3') },
		{ id: 'f3', partners: k('thirdDad', 'thirdMum'), children: k('sis3', 'wife3', 'bro3') },
		{ id: 'fg', partners: k('grandson', 'wife3'), children: [] }
	);
	const S = cardSize(PHOTO_W);
	const L = sideways(d5, components(d5).map((ids) => ({ label: 'x', ids })), undefined, S);
	const x = (id: string) => L.nodes.find((n) => n.id === id)!.x;
	it('keeps the layout rules', () => expect(checkLayout(d5, L, d5.people.map((p) => p.id))).toEqual([]));
	it("keeps a man's two families from crossing, and his younger sons beside their mother's side", () => {
		expect(x('son')).toBeLessThan(x('half1'));
		expect(x('half2')).toBeLessThan(x('thirdDad'));
	});
	// One forced by strict age order (the bride is the eldest, so her husband sits between her and her siblings), one
	// where the third family's line reaches over to the grandson.
	it('leaves only the crossings the rules force', () => expect(crossings(L).hops).toBeLessThanOrEqual(2));
});
