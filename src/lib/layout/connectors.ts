// Phase C tree layout, step 2: the lines between cards, worked out from card positions alone (so they can be
// re-run on in-between positions while the tree animates).
//
// Each family: a line between the two partners (if side by side), a drop from its midpoint (or from a single
// parent's card) to the family's own horizontal "bus", and a stub from the bus to each child. Families whose
// buses would overlap in the same gap get different heights (V8), and where a vertical line crosses another
// family's bus the bus hops over it (V9).
import type { Dataset, Family, Status } from '../model/types.ts';
import { childIds, partnerIds } from '../model/queries.ts';
import { GHOST_W, NODE_H, NODE_W, missingCount, type GhostBox, type NodeBox } from './positions.ts';

/** ghost = to a placeholder for children known to be missing; maybe = to a "more children?" one. */
export type LineStyle = 'solid' | 'likely' | 'guess' | 'ghost' | 'maybe';
export interface Seg { x1: number; y1: number; x2: number; y2: number }
export interface Line {
	/** Stable across layouts, e.g. "fam_x:bus", so lines can be keyed while animating. */
	key: string;
	familyId: string;
	kind: 'couple' | 'drop' | 'bus' | 'stub';
	d: string;
	style: LineStyle;
	seg: Seg;
	/** x positions where this (horizontal) line hops over a vertical one. */
	hops: number[];
}
/** Where a family's line to its children starts: the middle of the couple line, or the bottom of a lone parent. */
export interface Anchor { x: number; y: number; couple: boolean; bottom: number }

/** Bus heights: the first sits this far above the children's cards; each extra one is LANE_STEP higher. */
export const BUS_BASE = 24,
	LANE_STEP = 12,
	HOP_R = 5;

const styleOf = (st?: Status | ''): LineStyle => (st === 'guess' ? 'guess' : st === 'likely' ? 'likely' : 'solid');

export function routeConnectors(d: Dataset, nodes: NodeBox[], ghosts: GhostBox[], W = NODE_W): { lines: Line[]; anchors: Record<string, Anchor> } {
	const pos = new Map(nodes.map((n) => [n.id, n]));
	const ghostOf = new Map(ghosts.map((g) => [g.familyId, g]));
	const lines: Line[] = [];
	const anchors: Record<string, Anchor> = {};
	interface Bus { f: Family; lo: number; hi: number; top: number; ax: number | null; ay: number; targets: { key: string; x: number; y: number; style: LineStyle }[]; lane: number }
	const buses: Bus[] = [];
	const h = (key: string, f: Family, kind: Line['kind'], x1: number, x2: number, y: number, style: LineStyle) =>
		lines.push({ key, familyId: f.id, kind, d: '', style, seg: { x1, y1: y, x2, y2: y }, hops: [] });
	const v = (key: string, f: Family, kind: Line['kind'], x: number, y1: number, y2: number, style: LineStyle) =>
		lines.push({ key, familyId: f.id, kind, d: '', style, seg: { x1: x, y1, x2: x, y2 }, hops: [] });

	for (const f of [...d.families].sort((a, b) => a.id.localeCompare(b.id))) {
		const ps = partnerIds(f).flatMap((id) => pos.get(id) ?? []),
			cs = childIds(f).flatMap((id) => (pos.has(id) ? [{ id, n: pos.get(id)! }] : []));
		const gh = ghostOf.get(f.id);
		// A lone child whose parents are out of view would get a stub to nowhere.
		if (!ps.length && cs.length + (gh ? 1 : 0) < 2) continue;

		let ax: number | null = null,
			ay = 0;
		if (ps.length === 2 && ps[0].y === ps[1].y) {
			const [a, b] = [...ps].sort((p, q) => p.x - q.x);
			ay = a.y + NODE_H / 2;
			const st = f.relationship?.status ?? (f.partners.some((x) => x.status === 'guess') ? 'guess' : '');
			h(`${f.id}:couple`, f, 'couple', a.x + W, b.x, ay, styleOf(st));
			ax = (a.x + W + b.x) / 2;
			anchors[f.id] = { x: ax, y: ay, couple: true, bottom: a.y + NODE_H };
		} else if (ps.length) {
			ax = ps[0].x + W / 2;
			ay = ps[0].y + NODE_H;
			anchors[f.id] = { x: ax, y: ay, couple: false, bottom: ay };
		}

		const targets = cs.map(({ id, n }) => ({ key: `${f.id}:c:${id}`, x: n.x + W / 2, y: n.y, style: styleOf(f.children.find((c) => c.personId === id)!.status) }));
		if (gh) targets.push({ key: `${f.id}:ghost`, x: gh.x + GHOST_W / 2, y: gh.y, style: missingCount(f) ? 'ghost' : 'maybe' });
		if (!targets.length) continue;
		const xs = targets.map((t) => t.x).concat(ax != null ? [ax] : []);
		buses.push({ f, lo: Math.min(...xs), hi: Math.max(...xs), top: Math.min(...targets.map((t) => t.y)), ax, ay, targets, lane: 0 });
	}

	// V8: in each gap between rows, buses whose spans overlap get different heights (greedy interval colouring).
	const byGap = new Map<number, Bus[]>();
	for (const b of buses) (byGap.get(b.top) ?? byGap.set(b.top, []).get(b.top)!).push(b);
	for (const group of byGap.values()) {
		group.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.f.id.localeCompare(b.f.id));
		const laneEnd: number[] = [];
		for (const b of group) {
			let lane = laneEnd.findIndex((end) => end < b.lo - HOP_R * 2);
			if (lane < 0) lane = laneEnd.length;
			laneEnd[lane] = b.hi;
			b.lane = lane;
		}
	}

	for (const b of buses) {
		const y = b.top - BUS_BASE - b.lane * LANE_STEP;
		if (b.ax != null) v(`${b.f.id}:drop`, b.f, 'drop', b.ax, b.ay, y, 'solid');
		if (b.hi > b.lo) h(`${b.f.id}:bus`, b.f, 'bus', b.lo, b.hi, y, 'solid');
		for (const t of b.targets) v(t.key, b.f, 'stub', t.x, y, t.y, t.style);
	}

	// V9: a bus hops over any other family's vertical line that crosses it.
	const verticals = lines.filter((l) => l.kind === 'drop' || l.kind === 'stub');
	for (const l of lines) {
		if (l.kind !== 'bus') continue;
		const { x1, x2, y1: y } = l.seg;
		l.hops = verticals
			.filter((u) => u.familyId !== l.familyId && u.seg.x1 > x1 + HOP_R && u.seg.x1 < x2 - HOP_R && Math.min(u.seg.y1, u.seg.y2) < y - 0.5 && Math.max(u.seg.y1, u.seg.y2) > y + 0.5)
			.map((u) => u.seg.x1)
			.sort((a, b) => a - b)
			.filter((x, i, a) => i === 0 || x - a[i - 1] >= HOP_R * 2);
	}
	for (const l of lines) l.d = pathOf(l);
	return { lines, anchors };
}

/** SVG path for a line; horizontal lines bump up in a small semicircle at each hop. */
function pathOf(l: Line): string {
	const { x1, y1, x2, y2 } = l.seg;
	if (!l.hops.length) return `M${x1} ${y1}${y1 === y2 ? `H${x2}` : `V${y2}`}`;
	let p = `M${x1} ${y1}`;
	for (const x of l.hops) p += `H${x - HOP_R}A${HOP_R} ${HOP_R} 0 0 1 ${x + HOP_R} ${y1}`;
	return p + `H${x2}`;
}
