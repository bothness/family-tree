// Checks a tree layout against the Phase C rules. Returns a list of problems (empty = all good). Used by tests.
import type { Dataset } from '../model/types.ts';
import { birthStart, childIds, partnerIds, person } from '../model/queries.ts';
import { GHOST_W, NODE_W, type TreeLayout } from './tree.ts';

/** How far (px) beyond the outermost children's centres a parent couple may sit and still count as "above" them. */
export const CENTRE_TOLERANCE = NODE_W;

export function checkLayout(d: Dataset, L: TreeLayout, ids: string[]): string[] {
	const out: string[] = [];
	const name = (id: string) => person(d, id)?.names?.[0]?.given ?? id;
	const pos = new Map(L.nodes.map((n) => [n.id, n]));

	// Everyone shown exactly once.
	const seen = L.nodes.map((n) => n.id);
	if (seen.length !== new Set(seen).size) out.push('someone appears twice');
	for (const id of ids) if (!pos.has(id)) out.push(`${name(id)} is missing`);

	// No overlapping cards or placeholders.
	const boxes = [...L.nodes.map((n) => ({ k: name(n.id), x: n.x, y: n.y, w: NODE_W })), ...L.ghosts.map((g) => ({ k: `placeholder ${g.familyId}`, x: g.x, y: g.y, w: GHOST_W }))];
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i],
				b = boxes[j];
			if (a.y === b.y && a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4) out.push(`${a.k} overlaps ${b.k}`);
		}

	for (const f of d.families) {
		const ps = partnerIds(f).filter((p) => pos.has(p)),
			cs = childIds(f).filter((c) => pos.has(c));
		// Partners side by side on one row, nobody between them.
		if (ps.length === 2) {
			const [a, b] = ps.map((p) => pos.get(p)!).sort((p, q) => p.x - q.x);
			if (a.y !== b.y) out.push(`${name(a.id)} and ${name(b.id)} are on different rows`);
			else if (boxes.some((x) => x.y === a.y && x.x > a.x && x.x < b.x)) out.push(`someone sits between ${name(a.id)} and ${name(b.id)}`);
		}
		// Children below their parents, siblings in birth order.
		for (const c of cs) for (const p of ps) if (pos.get(c)!.y <= pos.get(p)!.y) out.push(`${name(c)} is not below ${name(p)}`);
		const byX = [...cs].sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
		const byBirth = [...cs].sort((a, b) => birthStart(d, a) - birthStart(d, b));
		if (byX.some((c, i) => c !== byBirth[i] && birthStart(d, c) !== birthStart(d, byBirth[i]))) out.push(`${f.id}: children not in birth order`);
		// Parents with one family sit over their children's block. Exact centring can't always hold (a partner's
		// parents may want the same space), and someone with several families sits between them by design, so
		// they're exempt.
		const multi = ps.some((p) => d.families.some((g) => g !== f && partnerIds(g).includes(p) && childIds(g).some((c) => pos.has(c))));
		const a = multi ? undefined : L.anchors[f.id];
		const kids = [...cs.map((c) => pos.get(c)!.x + NODE_W / 2), ...L.ghosts.filter((g) => g.familyId === f.id).map((g) => g.x + GHOST_W / 2)];
		if (a && kids.length) {
			const lo = Math.min(...kids) - CENTRE_TOLERANCE,
				hi = Math.max(...kids) + CENTRE_TOLERANCE;
			if (a.x < lo || a.x > hi) out.push(`${f.id}: parents aren't above their children (${Math.round(a.x < lo ? a.x - lo : a.x - hi)}px out)`);
		}
	}

	// Buses in the same gap whose spans overlap are at different heights (V8).
	const buses = L.lines.filter((l) => l.kind === 'bus');
	for (let i = 0; i < buses.length; i++)
		for (let j = i + 1; j < buses.length; j++) {
			const a = buses[i].seg,
				b = buses[j].seg;
			if (a.y1 === b.y1 && a.x1 < b.x2 && b.x1 < a.x2) out.push(`buses for ${buses[i].familyId} and ${buses[j].familyId} overlap`);
		}
	// Every crossing of a bus by another family's vertical line has a hop (V9).
	for (const b of buses)
		for (const v of L.lines)
			if ((v.kind === 'drop' || v.kind === 'stub') && v.familyId !== b.familyId) {
				const x = v.seg.x1,
					y = b.seg.y1;
				const crosses = x > b.seg.x1 + 1 && x < b.seg.x2 - 1 && Math.min(v.seg.y1, v.seg.y2) < y - 0.5 && Math.max(v.seg.y1, v.seg.y2) > y + 0.5;
				if (crosses && !b.hops.some((h) => Math.abs(h - x) < 1)) out.push(`${b.familyId}'s line crosses ${v.familyId}'s without a hop`);
			}
	// Card rows don't overlap the lines' space: every bus sits between its parents' row and its children's.
	for (const b of buses) if (L.lines.some((l) => l.familyId === b.familyId && l.kind === 'drop' && l.seg.y1 > b.seg.y1)) out.push(`${b.familyId}'s bus is above its parents`);
	return out;
}
