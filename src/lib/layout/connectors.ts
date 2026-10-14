// Phase C tree layout, step 2: the lines between cards, worked out from card positions alone (so they can be
// re-run on in-between positions while the tree animates).
//
// Each family: a line between the two partners (if side by side), a drop from its midpoint (or from a single
// parent's card) to the family's own horizontal "bus", and a stub from the bus to each child. Families whose
// buses would overlap in the same gap get different heights (V8), and where a vertical line crosses another
// family's bus the bus hops over it (V9). Partners with someone between them (a third partner, say) are joined
// by a raised line just above the cards, and their children's line drops through the gap just inside the
// "outer" partner (the one with fewer partners), so it never runs through a card.
import type { ChildRef, Dataset, EndReason, Family, Status } from '../model/types.ts';
import { childIds, partnerIds } from '../model/queries.ts';
import { anchorOffset, cardSize, missingCount, type CardSize, type GhostBox, type NodeBox } from './positions.ts';

/** ghost = to a placeholder for children known to be missing; maybe = to a "more children?" one; adopted = to an
 *  adopted child. */
export type LineStyle = 'solid' | 'likely' | 'guess' | 'ghost' | 'maybe' | 'adopted';
export interface Seg { x1: number; y1: number; x2: number; y2: number }
export interface Line {
	/** Stable across layouts, e.g. "fam_x:bus", so lines can be keyed while animating. */
	key: string;
	familyId: string;
	/** mark = the slash across a couple's line when they divorced or separated (the only line that isn't straight
	 *  across or down). */
	kind: 'couple' | 'drop' | 'bus' | 'stub' | 'mark';
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
/** Raised couple lines: the first sits this far above the cards, nested ones RAISE_STEP higher; they meet the
 *  cards this far in from the partners' inner edges. */
export const RAISE_BASE = 9,
	RAISE_STEP = 6,
	RAISE_INSET = 16;

const styleOf = (st?: Status | ''): LineStyle => (st === 'guess' ? 'guess' : st === 'likely' ? 'likely' : 'solid');
/** A child's line: a guess stays pencil; otherwise an adoption is dashed. */
const childStyle = (c: ChildRef): LineStyle => (c.status !== 'guess' && c.relation === 'adopted' ? 'adopted' : styleOf(c.status));
/** Partnerships that ended other than by a death are marked with a slash across the couple's line. */
const ENDED_APART: EndReason[] = ['divorce', 'separation', 'annulment'];
/** Half the slash's width and height (it leans like "/", steeper than a diagonal). */
const MARK_DX = 3.5,
	MARK_DY = 6;

export function routeConnectors(d: Dataset, nodes: NodeBox[], ghosts: GhostBox[], S: CardSize = cardSize()): { lines: Line[]; anchors: Record<string, Anchor> } {
	const W = S.w,
		NODE_H = S.h,
		GHOST_W = S.ghost;
	const pos = new Map(nodes.map((n) => [n.id, n]));
	const ghostOf = new Map(ghosts.map((g) => [g.familyId, g]));
	const lines: Line[] = [];
	const anchors: Record<string, Anchor> = {};
	interface Bus { f: Family; lo: number; hi: number; top: number; ax: number | null; ay: number; targets: { key: string; x: number; y: number; style: LineStyle; left: number; w: number }[]; lane: number }
	const buses: Bus[] = [];
	const h = (key: string, f: Family, kind: Line['kind'], x1: number, x2: number, y: number, style: LineStyle) =>
		lines.push({ key, familyId: f.id, kind, d: '', style, seg: { x1, y1: y, x2, y2: y }, hops: [] });
	const v = (key: string, f: Family, kind: Line['kind'], x: number, y1: number, y2: number, style: LineStyle) =>
		lines.push({ key, familyId: f.id, kind, d: '', style, seg: { x1: x, y1, x2: x, y2 }, hops: [] });

	// Couples on one row, and how many partners each person has there (as in positions.ts).
	const rowCouples = d.families.filter((f) => {
		const ps = partnerIds(f).map((id) => pos.get(id));
		return ps.length === 2 && ps[0] && ps[1] && ps[0].y === ps[1].y;
	});
	const partnerCount = new Map<string, number>();
	for (const f of rowCouples) for (const p of partnerIds(f)) partnerCount.set(p, (partnerCount.get(p) ?? 0) + 1);
	// Raised lines' heights: on each row, a line nested inside another sits below it (shortest lowest).
	const between = (a: NodeBox, b: NodeBox) => nodes.some((n) => n.y === a.y && n.x > a.x && n.x < b.x);
	const raised = new Map<string, number>();
	const spans = rowCouples
		.map((f) => ({ f, ab: partnerIds(f).map((id) => pos.get(id)!).sort((p, q) => p.x - q.x) }))
		.filter(({ ab: [a, b] }) => between(a, b))
		.sort((p, q) => p.ab[1].x - p.ab[0].x - (q.ab[1].x - q.ab[0].x) || p.f.id.localeCompare(q.f.id));
	for (const [i, { f, ab }] of spans.entries()) {
		const under = spans.slice(0, i).filter((o) => o.ab[0].y === ab[0].y && o.ab[0].x < ab[1].x && ab[0].x < o.ab[1].x);
		raised.set(f.id, Math.max(-1, ...under.map((o) => raised.get(o.f.id)!)) + 1);
	}

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
			const st = f.relationship?.status ?? (f.partners.some((x) => x.status === 'guess') ? 'guess' : '');
			const lane = raised.get(f.id);
			// Where the slash goes if they divorced or separated: the middle of the line between them.
			let mx: number;
			if (lane === undefined) {
				ay = a.y + NODE_H / 2;
				h(`${f.id}:couple`, f, 'couple', a.x + W, b.x, ay, styleOf(st));
				ax = mx = (a.x + W + b.x) / 2;
			} else {
				ay = a.y - RAISE_BASE - lane * RAISE_STEP;
				const x1 = a.x + W - RAISE_INSET,
					x2 = b.x + RAISE_INSET;
				v(`${f.id}:couple-l`, f, 'couple', x1, a.y, ay, styleOf(st));
				h(`${f.id}:couple`, f, 'couple', x1, x2, ay, styleOf(st));
				v(`${f.id}:couple-r`, f, 'couple', x2, ay, b.y, styleOf(st));
				const [ia, ib] = [a.id, b.id].map((p) => partnerCount.get(p) ?? 0);
				ax = a.x + anchorOffset(0, b.x - a.x, !(ia > ib), W);
				mx = (x1 + x2) / 2;
			}
			const end = f.relationship?.endReason;
			if (end && ENDED_APART.includes(end))
				lines.push({ key: `${f.id}:ended`, familyId: f.id, kind: 'mark', d: '', style: 'solid', seg: { x1: mx - MARK_DX, y1: ay + MARK_DY, x2: mx + MARK_DX, y2: ay - MARK_DY }, hops: [] });
			anchors[f.id] = { x: ax, y: ay, couple: true, bottom: a.y + NODE_H };
		} else if (ps.length) {
			ax = ps[0].x + W / 2;
			ay = ps[0].y + NODE_H;
			anchors[f.id] = { x: ax, y: ay, couple: false, bottom: ay };
		}

		const targets = cs.map(({ id, n }) => ({ key: `${f.id}:c:${id}`, x: n.x + W / 2, y: n.y, style: childStyle(f.children.find((c) => c.personId === id)!), left: n.x, w: W }));
		if (gh) targets.push({ key: `${f.id}:ghost`, x: gh.x + GHOST_W / 2, y: gh.y, style: missingCount(f) ? 'ghost' : 'maybe', left: gh.x, w: GHOST_W });
		if (!targets.length) continue;
		const xs = targets.map((t) => t.x).concat(ax != null ? [ax] : []);
		buses.push({ f, lo: Math.min(...xs), hi: Math.max(...xs), top: Math.min(...targets.map((t) => t.y)), ax, ay, targets, lane: 0 });
	}

	// A child's line that would run along another family's line down to its own children (the two happen to line
	// up) is moved along the child's card, clear of it, so the lines can't merge or hop on top of each other.
	const CLEAR = HOP_R * 2.5;
	for (const b of buses) {
		const drops = buses.filter((o) => o !== b && o.top === b.top && o.ax != null).map((o) => o.ax!);
		if (!drops.length) continue;
		for (const t of b.targets) {
			const near = drops.filter((x) => Math.abs(x - t.x) < CLEAR);
			if (!near.length) continue;
			const lo = t.left + 12,
				hi = t.left + t.w - 12;
			const tries = [1, -1, 2, -2].map((k) => t.x + k * CLEAR * 1.2).filter((x) => x >= lo && x <= hi && drops.every((d) => Math.abs(d - x) >= CLEAR));
			if (tries.length) t.x = tries[0];
		}
		const xs = b.targets.map((t) => t.x).concat(b.ax != null ? [b.ax] : []);
		b.lo = Math.min(...xs);
		b.hi = Math.max(...xs);
	}

	// V8: in each gap between rows, buses whose spans overlap get different heights. Which goes above decides the
	// hops: a bus higher up hops over the other's line down from its parents, a bus lower down over the other's
	// lines down to its children. So the buses are put in the order with fewest hops (starting from the greedy
	// interval colouring, swapping neighbours while that helps), then each sits just above those it overlaps below it.
	const byGap = new Map<number, Bus[]>();
	for (const b of buses) (byGap.get(b.top) ?? byGap.set(b.top, []).get(b.top)!).push(b);
	const overlap = (a: Bus, b: Bus) => a.lo < b.hi + HOP_R * 2 && b.lo < a.hi + HOP_R * 2;
	const inside = (x: number, b: Bus) => x > b.lo + HOP_R && x < b.hi - HOP_R;
	/** Hops when `up` sits above `down`. */
	const hopsOver = (up: Bus, down: Bus) => (down.ax != null && inside(down.ax, up) ? 1 : 0) + up.targets.filter((t) => inside(t.x, down)).length;
	for (const group of byGap.values()) {
		group.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.f.id.localeCompare(b.f.id));
		const laneEnd: number[] = [];
		for (const b of group) {
			let lane = laneEnd.findIndex((end) => end < b.lo - HOP_R * 2);
			if (lane < 0) lane = laneEnd.length;
			laneEnd[lane] = b.hi;
			b.lane = lane;
		}
		// Lowest first.
		const order = [...group].sort((a, b) => a.lane - b.lane || a.lo - b.lo);
		const cost = () => {
			let n = 0;
			for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (overlap(order[i], order[j])) n += hopsOver(order[j], order[i]);
			return n;
		};
		let best = cost();
		// Each bus tried at every place in the order (buses that don't overlap can sit between two that do).
		for (let pass = 0, moved = true; moved && best && pass < 4; pass++) {
			moved = false;
			for (const b of [...order]) {
				const from = order.indexOf(b);
				for (let to = 0; to < order.length; to++) {
					if (to === from) continue;
					order.splice(from, 1);
					order.splice(to, 0, b);
					const c = cost();
					if (c < best) {
						best = c;
						moved = true;
						break;
					}
					order.splice(to, 1);
					order.splice(from, 0, b);
				}
			}
		}
		const placed: Bus[] = [];
		for (const b of order) {
			b.lane = Math.max(-1, ...placed.filter((o) => overlap(o, b)).map((o) => o.lane)) + 1;
			placed.push(b);
		}
	}

	for (const b of buses) {
		const y = b.top - BUS_BASE - b.lane * LANE_STEP;
		if (b.ax != null) v(`${b.f.id}:drop`, b.f, 'drop', b.ax, b.ay, y, 'solid');
		if (b.hi > b.lo) h(`${b.f.id}:bus`, b.f, 'bus', b.lo, b.hi, y, 'solid');
		for (const t of b.targets) v(t.key, b.f, 'stub', t.x, y, t.y, t.style);
	}

	// V9: a bus (or a raised couple line) hops over any other family's vertical line that crosses it.
	const verticals = lines.filter((l) => l.kind === 'drop' || l.kind === 'stub');
	for (const l of lines) {
		if (l.kind !== 'bus' && !(l.kind === 'couple' && raised.has(l.familyId) && l.seg.y1 === l.seg.y2)) continue;
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

/** SVG path for a line; a line with hops bumps out in a small semicircle at each (upwards on a horizontal line,
 *  sideways on a vertical one, as in a left-to-right tree). */
export function pathOf(l: Line): string {
	const { x1, y1, x2, y2 } = l.seg;
	if (x1 !== x2 && y1 !== y2) return `M${x1} ${y1}L${x2} ${y2}`;
	if (!l.hops.length) return `M${x1} ${y1}${y1 === y2 ? `H${x2}` : `V${y2}`}`;
	let p = `M${x1} ${y1}`;
	if (y1 === y2) {
		for (const x of l.hops) p += `H${x - HOP_R}A${HOP_R} ${HOP_R} 0 0 1 ${x + HOP_R} ${y1}`;
		return p + `H${x2}`;
	}
	for (const y of l.hops) p += `V${y - HOP_R}A${HOP_R} ${HOP_R} 0 0 0 ${x1} ${y + HOP_R}`;
	return p + `V${y2}`;
}
