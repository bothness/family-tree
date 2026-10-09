// Checks a tree layout against the Phase C rules. Returns a list of problems (empty = all good). Used by tests.
import type { Dataset } from '../model/types.ts';
import { birthStart, childIds, partnerIds, person } from '../model/queries.ts';
import { GHOST_W, NODE_H, type TreeLayout } from './tree.ts';

type NodeLike = { id: string; x: number };

export function checkLayout(d: Dataset, L: TreeLayout, ids: string[]): string[] {
	const out: string[] = [];
	const NODE_W = L.cardW;
	/** How far (px) beyond the outermost children's centres a parent couple may sit and still count as "above" them. */
	const CENTRE_TOLERANCE = NODE_W;
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

	// Whose child each visible person is, counting only families with a parent in view.
	const parentFam = new Map<string, string>();
	for (const f of d.families) if (partnerIds(f).some((p) => pos.has(p))) for (const c of childIds(f)) if (pos.has(c)) parentFam.set(c, f.id);
	// Partners on the same row, and everyone linked to someone through them (a person, their partners, their
	// partners' other partners…): the group that sits together on the row.
	const rowPartners = new Map<string, string[]>();
	/** Families whose children (their parent families in view) are married to each other more than once. */
	const linkCount = (fa: string, fb: string) =>
		d.families.filter((g) => {
			const fs = partnerIds(g).map((p) => (pos.has(p) ? parentFam.get(p) : undefined));
			return (fs[0] === fa && fs[1] === fb) || (fs[0] === fb && fs[1] === fa);
		}).length;

	for (const f of d.families) {
		const ps = partnerIds(f).filter((p) => pos.has(p));
		if (ps.length === 2 && pos.get(ps[0])!.y === pos.get(ps[1])!.y)
			for (const [a, b] of [ps, [...ps].reverse()]) (rowPartners.get(a) ?? rowPartners.set(a, []).get(a)!).push(b);
	}
	const partnerGroup = (id: string) => {
		const g = new Set([id]);
		for (const m of g) for (const o of rowPartners.get(m) ?? []) g.add(o);
		return g;
	};
	/** A child sitting with someone whose own parents are in view (a spouse, or a spouse's other partner): they sit
	 *  with that family's children, so their own brothers and sisters may be some way off. They don't count when
	 *  checking their family is unbroken and in age order. */
	const marriedAcross = (c: string, fid: string) => [...partnerGroup(c)].some((o) => o !== c && parentFam.has(o) && parentFam.get(o) !== fid);

	for (const f of d.families) {
		const ps = partnerIds(f).filter((p) => pos.has(p)),
			cs = childIds(f).filter((c) => pos.has(c));
		// Partners side by side on one row, nobody between them.
		if (ps.length === 2) {
			const [a, b] = ps.map((p) => pos.get(p)!).sort((p, q) => p.x - q.x);
			if (a.y !== b.y) out.push(`${name(a.id)} and ${name(b.id)} are on different rows`);
			else {
				// Only their own other partners may sit between them, and then their line is raised over them.
				const mid = L.nodes.filter((x) => x.y === a.y && x.x > a.x && x.x < b.x);
				const group = partnerGroup(a.id);
				if (mid.some((x) => !group.has(x.id)) || L.ghosts.some((g) => g.y === a.y && g.x > a.x && g.x < b.x))
					out.push(`someone sits between ${name(a.id)} and ${name(b.id)}`);
				else if (mid.length && !L.lines.some((l) => l.familyId === f.id && l.kind === 'couple' && l.seg.y1 === l.seg.y2 && l.seg.y1 < a.y))
					out.push(`${name(a.id)} and ${name(b.id)} have someone between them but no raised line`);
			}
		}
		// Children below their parents, siblings in strict birth order.
		for (const c of cs) for (const p of ps) if (pos.get(c)!.y <= pos.get(p)!.y) out.push(`${name(c)} is not below ${name(p)}`);
		const inOrder = cs.filter((c) => !marriedAcross(c, f.id));
		const byX = [...inOrder].sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
		const byBirth = [...inOrder].sort((a, b) => birthStart(d, a) - birthStart(d, b));
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

	// Each family's children form one unbroken run on their row: nobody else's child sits among them, apart from
	// those children's own partners (V8). A child married across sits by their spouse, so the run is counted
	// without them.
	for (const f of d.families) {
		if (!partnerIds(f).some((p) => pos.has(p))) continue;
		const xs = [
			...childIds(f).filter((c) => pos.has(c) && !marriedAcross(c, f.id)).map((c) => pos.get(c)!),
			...L.ghosts.filter((g) => g.familyId === f.id)
		];
		if (xs.length < 2) continue;
		const y = xs[0].y,
			lo = Math.min(...xs.map((b) => b.x)),
			hi = Math.max(...xs.map((b) => b.x));
		const partnersOfKids = new Set(
			d.families.filter((g) => partnerIds(g).some((p) => childIds(f).includes(p))).flatMap((g) => partnerIds(g))
		);
		for (const n of L.nodes) {
			const pf = parentFam.get(n.id);
			if (n.y === y && n.x > lo && n.x < hi && pf && pf !== f.id && !partnersOfKids.has(n.id)) out.push(`${name(n.id)} sits among ${f.id}'s children`);
		}
	}
	// A couple whose parents are both in view: at least one partner's brothers and sisters are all on their own side
	// (with strict age order the other's may be on both sides of the couple) (V8). When the two families are linked
	// by more than one marriage, only one couple can sit where the families meet; the others sit within one family's
	// run (a spouse joins their partner), so it's enough that one partner's brothers and sisters are all to one side.
	for (const f of d.families) {
		const ps = partnerIds(f).filter((p) => pos.has(p) && parentFam.has(p));
		if (ps.length !== 2 || parentFam.get(ps[0]) === parentFam.get(ps[1])) continue;
		const [a, b] = ps.map((p) => pos.get(p)!).sort((p, q) => p.x - q.x);
		const fid = (p: string) => parentFam.get(p)!;
		const sibs = (p: string) => childIds(d.families.find((g) => g.id === fid(p))!).filter((c) => c !== p && pos.has(c) && !marriedAcross(c, fid(p)));
		const leftOk = sibs(a.id).every((s) => pos.get(s)!.x < a.x),
			rightOk = sibs(b.id).every((s) => pos.get(s)!.x > b.x);
		const oneSide = (p: NodeLike) => sibs(p.id).every((s) => pos.get(s)!.x < p.x) || sibs(p.id).every((s) => pos.get(s)!.x > p.x);
		const relaxed = linkCount(fid(a.id), fid(b.id)) > 1 && (oneSide(a) || oneSide(b));
		if (!leftOk && !rightOk && !relaxed) out.push(`${name(a.id)} and ${name(b.id)}'s brothers and sisters are mixed on both sides`);
	}
	// A couple with both partners' parents in view doesn't sit crossed under them (the left partner's parents to
	// the right of the right partner's).
	for (const f of d.families) {
		const ps = partnerIds(f).filter((p) => pos.has(p) && parentFam.has(p));
		if (ps.length !== 2 || pos.get(ps[0])!.y !== pos.get(ps[1])!.y) continue;
		const [a, b] = ps.sort((p, q) => pos.get(p)!.x - pos.get(q)!.x).map((p) => L.anchors[parentFam.get(p)!]);
		if (a && b && a.x > b.x + 1) out.push(`${f.id}: the couple sits crossed under their parents`);
	}
	// No vertical line runs through a card.
	for (const l of L.lines)
		if (l.kind === 'drop' || l.kind === 'stub') {
			const x = l.seg.x1,
				y0 = Math.min(l.seg.y1, l.seg.y2),
				y1 = Math.max(l.seg.y1, l.seg.y2);
			for (const b of boxes) if (x > b.x + 1 && x < b.x + b.w - 1 && b.y + 1 < y1 && b.y + NODE_H - 1 > y0) out.push(`a line of ${l.familyId} runs through ${b.k}`);
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
