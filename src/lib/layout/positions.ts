// Phase C tree layout, step 1: where each card goes. Lines are drawn separately (connectors.ts) from these
// positions alone, so the tree can be animated by moving cards and re-running the connectors.
//
// Rules (src/lib/layout/CLAUDE.md): one row per generation; partners side by side (father left for a single couple, unless
// both partners' parents are in view the other way round and can't be moved, when they swap so lines don't cross;
// someone with several partners sits between them, earlier partnerships on the left, each partner's other partners
// further out; a couple who can't be side by side get a raised line, see connectors.ts); each family's children
// form a block under their parents, oldest first; parents centred over their children; a partner's own parents
// placed above them; nothing ordered by when it was added.
//
// Method: generations by breadth-first search from a fixed starting person; people grouped into "units"
// (a person and their partners on the same row); units ordered row by row by walking down the families
// (in-laws' parents inserted above them); then x positions found by repeated sweeps that pull children under
// their parents and parents over their children, keeping each row's order and spacing (isotonic regression).
import type { Dataset, Family } from '../model/types.ts';
import { birthStart, childIds, partnerIds, sexRank } from '../model/queries.ts';
import { edtfRange } from '../model/edtf.ts';

/** Card width without photos (compact) and with them (V10); the layout takes the card size to use. */
export const NODE_W = 156,
	PHOTO_W = 204,
	NODE_H = 58,
	GHOST_W = 104;
/** Vertical trees (V13): narrower cards with the photo above the name (or just the name, wrapped, without
 *  photos); horizontal trees (V14) use the wide cards. */
export const PORTRAIT_W = 112,
	PORTRAIT_H = 170,
	PORTRAIT_NOPHOTO_H = 72;
/** The size of the boxes the layout places: cards (w × h) and missing-children placeholders (ghost × h). */
export interface CardSize { w: number; h: number; ghost: number }
export const cardSize = (w = NODE_W, h = NODE_H, ghost = GHOST_W): CardSize => ({ w, h, ghost });
/** Space between one generation's cards and the next (for the lines). */
export const ROW_GAP = 84;
/** Gap between partners' cards. */
export const CARD_GAP = 14;
/** Gap between siblings (units with the same parents). */
export const SIB_GAP = 22;
/** Gap between units from different families on the same row. */
export const FAM_GAP = 44;
/** Vertical distance from one row's top to the next. */
export const ROW_H = NODE_H + ROW_GAP;
/** Gap between unconnected groups. */
export const COMP_GAP = 90;
/** Branch labels sit this far above the top row. */
const LABEL_DY = 16;

export interface NodeBox { id: string; x: number; y: number }
export interface GhostBox { familyId: string; x: number; y: number; missing: number | null }
export interface BranchLabel { text: string; x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }
export interface Positions { nodes: NodeBox[]; ghosts: GhostBox[]; labels: BranchLabel[]; bounds: Box; /** Card width used. */ cardW: number; /** Box sizes used. */ size: CardSize }

interface Unit {
	key: string;
	g: number;
	/** People left to right (empty for a missing-children placeholder). */
	members: string[];
	/** The family a placeholder stands for. */
	ghost?: Family;
	w: number;
	x: number;
	placed: boolean;
}
interface Fam {
	f: Family;
	ps: string[];
	cs: string[];
	/** The unit holding the (first visible) parent, and where the line to the children leaves it. */
	parent?: Unit;
	anchorOff: number;
	kids: Unit[];
	/** A child married to someone whose own parents are in view, and which side of them that spouse is on: the
	 *  spouse's brothers and sisters are placed beyond this family's children on that side. */
	bridge?: Unit;
	side?: 'left' | 'right';
}

/** Children known to be missing (expected count minus those recorded), or null if no count was recorded. */
export function missingCount(f: Family): number | null {
	const min = f.expectedChildren?.min;
	return min != null && min > f.children.length ? min - f.children.length : null;
}

/** Ordering rows (step 3b): seed rows tried, sweeps from each, rounds of small changes (bounds, as it runs on every
 *  edit); how much a card width of line counts against a crossing, and an out-of-order brother or sister, or a couple
 *  the other way round. */
const SEEDS = 3,
	SWEEPS = 6,
	ROUNDS = 6,
	REACH = 0.1,
	SOFT = 0.2;

const relStart = (f: Family) => edtfRange(f.relationship?.start?.edtf)?.start ?? Infinity;
const byBirth = (d: Dataset) => (a: string, b: string) => birthStart(d, a) - birthStart(d, b) || a.localeCompare(b);

function layoutComponent(d: Dataset, ids: string[], root: string | undefined, S: CardSize) {
	const W = S.w,
		GHOST = S.ghost;
	const inC = new Set(ids);
	const birth = byBirth(d);
	const fams: Fam[] = d.families
		.map((f) => ({ f, ps: partnerIds(f).filter((p) => inC.has(p)), cs: childIds(f).filter((c) => inC.has(c)), anchorOff: 0, kids: [] as Unit[] }))
		.filter((x) => x.ps.length || x.cs.length)
		.sort((a, b) => relStart(a.f) - relStart(b.f) || a.f.id.localeCompare(b.f.id));

	// 1. Generations: breadth-first from a fixed person (the focus person, else the earliest born), visiting
	// neighbours in a fixed order. Partners share a row; children go one row down.
	const nbrs = new Map<string, [string, number][]>(ids.map((i) => [i, []]));
	for (const { ps, cs } of fams) {
		for (const p of ps) {
			for (const q of ps) if (q !== p) nbrs.get(p)!.push([q, 0]);
			for (const c of cs) nbrs.get(p)!.push([c, 1]);
		}
		for (const c of cs) {
			for (const p of ps) nbrs.get(c)!.push([p, -1]);
			for (const s of cs) if (s !== c) nbrs.get(c)!.push([s, 0]);
		}
	}
	for (const l of nbrs.values()) l.sort((a, b) => birth(a[0], b[0]));
	const gen = new Map<string, number>();
	const sortedIds = [...ids].sort(birth);
	for (const start of [root && inC.has(root) ? root : sortedIds[0], ...sortedIds]) {
		if (gen.has(start)) continue;
		gen.set(start, 0);
		const q = [start];
		while (q.length) {
			const id = q.shift()!;
			for (const [o, dg] of nbrs.get(id)!)
				if (!gen.has(o)) {
					gen.set(o, gen.get(id)! + dg);
					q.push(o);
				}
		}
	}
	const minG = Math.min(...gen.values());
	for (const [k, v] of gen) gen.set(k, v - minG);

	// 2. Units: people joined by partnerships on the same row, arranged left to right.
	const couples = fams.filter((x) => x.ps.length === 2 && gen.get(x.ps[0]) === gen.get(x.ps[1]));
	const partners = new Map<string, { p: string; f: Family }[]>();
	for (const { f, ps } of couples)
		for (const [a, b] of [[ps[0], ps[1]], [ps[1], ps[0]]]) (partners.get(a) ?? partners.set(a, []).get(a)!).push({ p: b, f });
	const unitOf = new Map<string, Unit>();
	const units: Unit[] = [];
	for (const id of sortedIds) {
		if (unitOf.has(id)) continue;
		// Everyone linked to `id` through partnerships on this row.
		const group = new Set([id]);
		for (const m of group) for (const { p } of partners.get(m) ?? []) group.add(p);
		const members = arrange([...group], partners, d);
		const u: Unit = { key: members[0], g: gen.get(id)!, members, w: members.length * W + (members.length - 1) * CARD_GAP, x: 0, placed: false };
		units.push(u);
		for (const m of members) unitOf.set(m, u);
	}
	const cardLeft = (u: Unit, id: string) => u.members.indexOf(id) * (W + CARD_GAP);

	// Placeholders for missing children: only under visible parents, and only when every known child is in view
	// (otherwise the edge of a focus would look like a research gap).
	for (const fm of fams) {
		const { f, ps, cs } = fm;
		if (f.childrenComplete !== 'no' || (!ps.length && partnerIds(f).length) || cs.length < childIds(f).length) continue;
		const g = cs.length ? gen.get(cs[0])! : gen.get(ps[0])! + 1;
		const u: Unit = { key: `ghost:${f.id}`, g, members: [], ghost: f, w: GHOST, x: 0, placed: false };
		units.push(u);
		fm.kids.push(u);
	}

	// Each family's parent unit, where its line leaves that unit, and its children's units (oldest first).
	const setAnchor = (fm: Fam) => {
		const vis = fm.ps;
		const u = fm.parent!;
		if (vis.length === 2 && unitOf.get(vis[1]) === u) {
			const [l, r] = [...vis].sort((a, b) => cardLeft(u, a) - cardLeft(u, b));
			const outerLeft = !(partnerCount(partners, l) > partnerCount(partners, r));
			fm.anchorOff = anchorOffset(cardLeft(u, l), cardLeft(u, r), outerLeft, W);
		} else fm.anchorOff = cardLeft(u, vis[0]) + W / 2;
	};
	for (const fm of fams)
		if (fm.ps.length) {
			fm.parent = unitOf.get(fm.ps[0])!;
			setAnchor(fm);
		}
	const childOf = new Map<string, Fam>();
	for (const fm of fams) if (fm.parent) for (const c of fm.cs) childOf.set(c, fm);
	for (const fm of fams) {
		const ghost = fm.kids;
		// Siblings in age order (oldest left), then the placeholder for missing children: the order to start from, and
		// the one preferred when nothing else decides (step 3b).
		const kidUnits = [...new Set([...fm.cs].sort(birth).map((c) => unitOf.get(c)!))];
		fm.kids = [...kidUnits, ...ghost];
		for (const k of kidUnits) {
			const m = k.members.find((x) => fm.cs.includes(x))!;
			const spouse = k.members.find((o) => o !== m && childOf.has(o) && childOf.get(o) !== fm);
			if (!spouse || !fm.parent) continue;
			fm.bridge = k;
			fm.side = k.members.indexOf(spouse) > k.members.indexOf(m) ? 'right' : 'left';
			break;
		}
	}
	const famsOf = new Map<Unit, Fam[]>();
	for (const fm of fams)
		if (fm.parent && fm.kids.length) (famsOf.get(fm.parent) ?? famsOf.set(fm.parent, []).get(fm.parent)!).push(fm);
	for (const l of famsOf.values()) l.sort((a, b) => a.anchorOff - b.anchorOff);
	const parentFams = new Map<Unit, Fam[]>();
	for (const fm of fams) if (fm.parent) for (const k of fm.kids) (parentFams.get(k) ?? parentFams.set(k, []).get(k)!).push(fm);
	/** The person in a unit who is the child of `fm` (where the unit hangs from), or the placeholder itself. */
	const childLeft = (k: Unit, fm: Fam) => (k.ghost ? 0 : cardLeft(k, k.members.find((m) => fm.cs.includes(m))!));
	const childW = (k: Unit) => (k.ghost ? GHOST : W);

	// 3. Order units within rows: walk down from the earliest roots; a group that only joins in below (a partner's
	// parents) is inserted above the person it joins, once there are positions to aim for.
	const maxG = Math.max(0, ...units.map((u) => u.g));
	const rows: Unit[][] = Array.from({ length: maxG + 1 }, () => []);
	const reach = (u: Unit, acc = new Set<Unit>()) => {
		if (acc.has(u)) return acc;
		acc.add(u);
		for (const fm of famsOf.get(u) ?? []) for (const k of fm.kids) reach(k, acc);
		return acc;
	};
	const emit = (u: Unit) => {
		if (u.placed) return;
		u.placed = true;
		rows[u.g].push(u);
		for (const fm of famsOf.get(u) ?? []) for (const k of fm.kids) emit(k);
	};
	// Siblings with no parents in view still belong together: group roots by the family they're children of.
	const sibGroup = (u: Unit) => fams.find((fm) => !fm.parent && u.members.some((m) => fm.cs.includes(m)))?.f.id ?? '';
	const roots = units
		.filter((u) => !parentFams.get(u)?.length)
		.sort((a, b) => a.g - b.g || sibGroup(a).localeCompare(sibGroup(b)) || birthStart(d, a.members[0] ?? '') - birthStart(d, b.members[0] ?? '') || a.key.localeCompare(b.key));
	const deferred: Unit[] = [];
	for (const r of roots) {
		if (r.placed) continue;
		if (rows.some((row) => row.length) && [...reach(r)].some((u) => u.placed)) deferred.push(r);
		else emit(r);
	}
	// Brothers and sisters whose parents aren't in view: nothing above or below pulls them together, so the sweep
	// keeps each one beside the others.
	const orphanSibs = new Map<Unit, Unit[]>();
	for (const fm of fams)
		if (!fm.parent) for (const k of fm.kids) if (!k.ghost) orphanSibs.set(k, [...(orphanSibs.get(k) ?? []), ...fm.kids.filter((o) => o !== k && !o.ghost && o.g === k.g)]);
	const sweep = (iterations = 12) => sweepX(rows, famsOf, parentFams, childLeft, childW, iterations, orphanSibs);
	sweep();
	for (const r of deferred) {
		let fresh = [...reach(r)].filter((u) => !u.placed);
		// A spouse's brothers and sisters go on the spouse's side, beyond the other family's children (which stay in
		// age order around the couple), in age order.
		for (const fm of fams) {
			if (!fm.bridge?.placed) continue;
			const block = fm.kids.filter((k) => k !== fm.bridge && fresh.includes(k));
			if (!block.length) continue;
			const row = rows[fm.bridge.g];
			const other = (parentFams.get(fm.bridge) ?? []).find((g) => g !== fm && g.kids.every((k) => k.placed));
			const run = (other?.kids ?? [fm.bridge]).filter((k) => row.includes(k)).map((k) => row.indexOf(k));
			// If this family's parents are already placed (their own parents were in view first), put the block on
			// their side, so its lines stay short; otherwise beyond the run on the spouse's side.
			let side = fm.side;
			if (fm.parent?.placed && !fresh.includes(fm.parent)) {
				const mid = (row[Math.min(...run)].x + row[Math.max(...run)].x + row[Math.max(...run)].w) / 2;
				side = fm.parent.x + fm.anchorOff > mid ? 'left' : 'right';
			}
			if (side === 'left') {
				// The spouse is on the left, so this family's other children go to the right of that run.
				const end = row[Math.max(...run)];
				let x = end.x + end.w + FAM_GAP;
				row.splice(Math.max(...run) + 1, 0, ...block);
				for (const k of block) (k.x = x), (x += k.w + SIB_GAP), (k.placed = true);
			} else {
				const startU = row[Math.min(...run)];
				let x = startU.x - FAM_GAP + SIB_GAP;
				row.splice(Math.min(...run), 0, ...block);
				for (const k of [...block].reverse()) (x -= k.w + SIB_GAP), (k.x = x), (k.placed = true);
			}
			fresh = fresh.filter((u) => !u.placed);
		}
		// Aim each other new unit at its children's centre (bottom-up), else at its parents' (top-down).
		const want = new Map<Unit, number>();
		const centre = (u: Unit) => (u.placed ? u.x + u.w / 2 : want.get(u));
		const kidCentre = (k: Unit, fm: Fam) => (k.placed ? k.x + childLeft(k, fm) + childW(k) / 2 : want.get(k));
		for (const u of [...fresh].reverse()) {
			const cs = (famsOf.get(u) ?? []).flatMap((fm) => fm.kids.map((k) => kidCentre(k, fm))).filter((x): x is number => x !== undefined);
			if (cs.length) want.set(u, cs.reduce((a, b) => a + b, 0) / cs.length);
		}
		for (const u of fresh)
			if (!want.has(u)) {
				const ps = (parentFams.get(u) ?? []).map((fm) => fm.parent && centre(fm.parent)).filter((x): x is number => x !== undefined);
				want.set(u, ps.length ? ps[0] : 0);
			}
		for (const u of fresh) {
			const c = want.get(u)!;
			const row = rows[u.g];
			const i = row.findIndex((v) => v.x + v.w / 2 > c);
			row.splice(i < 0 ? row.length : i, 0, u);
			u.x = c - u.w / 2;
			u.placed = true;
		}
		sweep();
	}

	// Brothers and sisters whose parents aren't in view stay together too. Someone with no other family in view
	// would otherwise sit wherever they were first put (the end of the row, if their sibling is placed later as an
	// in-law), so they go beside their siblings, in age order.
	const famsBelow = (k: Unit) => !!famsOf.get(k)?.length;
	for (const fm of fams) {
		if (fm.parent) continue;
		const ks = fm.kids.filter((k) => !k.ghost);
		const lone = ks.filter((k) => k.members.length === 1 && !famsBelow(k));
		if (!lone.length || lone.length === ks.length) continue;
		const row = rows[ks[0].g];
		if (ks.some((k) => k.g !== ks[0].g)) continue;
		for (const k of lone) row.splice(row.indexOf(k), 1);
		for (const k of lone) {
			const i = ks.indexOf(k);
			const inRow = (v: Unit) => row.includes(v);
			const next = ks.slice(i + 1).find(inRow),
				prev = ks.slice(0, i).reverse().find(inRow);
			if (next) {
				row.splice(row.indexOf(next), 0, k);
				k.x = next.x - k.w - SIB_GAP;
			} else if (prev) {
				row.splice(row.indexOf(prev) + 1, 0, k);
				k.x = prev.x + prev.w + SIB_GAP;
			}
		}
		sweep();
	}

	// 3b. Order first. The order so far follows the rules one family at a time, so lines can cross and an in-law family
	// can land inside another's run of children. Every row is reordered from its neighbours' order alone (positions
	// come after). Each row is split into blocks that stay together: a family's children, joined with the families
	// they marry into (from who is whose child, not who sits beside whom, so a split run is joined up again).
	// Starting from the widest rows (ancestors ordered from the row below, descendants from the row above), whole
	// sweeps down and up keep the best order seen; then small changes are kept while they help. Fewest lines crossing
	// comes first (after the couple rules); line length, age order and partners' usual order only break ties.
	const sibFams = (u: Unit) => [...(parentFams.get(u) ?? []), ...fams.filter((fm) => !fm.parent && fm.kids.includes(u))];
	const related = (a: Unit, b: Unit) => sibFams(a).some((f) => sibFams(b).includes(f));
	/** A point's place along its row: the unit's index plus how far across the unit it is. */
	const at = (row: Map<Unit, number>, u: Unit, off: number) => row.get(u)! + off / (u.w + 1);
	/** Lines that cross between neighbouring rows, from the order alone. */
	function crossingCount(): number {
		let n = 0;
		for (let g = 0; g < rows.length - 1; g++) {
			const P = new Map(rows[g].map((u, i) => [u, i])),
				C = new Map(rows[g + 1].map((u, i) => [u, i]));
			const links: [number, number, Fam, Unit][] = [];
			for (const fm of fams) {
				if (!fm.parent || !P.has(fm.parent)) continue;
				const a = at(P, fm.parent, fm.anchorOff);
				for (const k of fm.kids) if (C.has(k)) links.push([a, at(C, k, childLeft(k, fm) + childW(k) / 2), fm, k]);
			}
			// Two of one person's families crossing (their children by different partners) is the most confusing
			// tangle, so it counts double.
			for (let i = 0; i < links.length; i++)
				for (let j = i + 1; j < links.length; j++)
					if (links[i][2] !== links[j][2] && (links[i][0] - links[j][0]) * (links[i][1] - links[j][1]) < 0)
						n += links[i][2].parent === links[j][2].parent ? 2 : 1;
		}
		return n;
	}
	// Couples with both partners' parents in view (in different families), and how many couples link each two families.
	const pairs = couples.map((c) => c.ps).filter(([a, b]) => childOf.get(a)?.parent && childOf.get(b)?.parent && childOf.get(a) !== childOf.get(b));
	const linkCount = new Map<string, number>();
	const pairKey = (a: Fam, b: Fam) => [a.f.id, b.f.id].sort().join('|');
	for (const [a, b] of pairs) linkCount.set(pairKey(childOf.get(a)!, childOf.get(b)!), (linkCount.get(pairKey(childOf.get(a)!, childOf.get(b)!)) ?? 0) + 1);
	/** Someone sitting with a spouse whose own parents are in view: they don't count as "mixed" (they sit with that
	 *  family by design). */
	const married = new Set(
		units.flatMap((u) => u.members.filter((c) => childOf.get(c) && u.members.some((o) => o !== c && childOf.get(o)?.parent && childOf.get(o) !== childOf.get(c))))
	);
	const blocks = rows.map((row) => {
		const idx = new Map(row.map((u, i) => [u, i]));
		const root = new Map<Unit, Unit>(row.map((u) => [u, u]));
		const find = (u: Unit): Unit => {
			while (root.get(u) !== u) u = root.get(u)!;
			return u;
		};
		const byFam = new Map<Fam, Unit>();
		for (const u of row)
			for (const fm of sibFams(u)) {
				const o = byFam.get(fm);
				if (o) root.set(find(u), find(o));
				else byFam.set(fm, u);
			}
		const groups = new Map<Unit, Unit[]>();
		for (const u of row) (groups.get(find(u)) ?? groups.set(find(u), []).get(find(u))!).push(u);
		const mean = (b: Unit[]) => b.reduce((n, u) => n + idx.get(u)!, 0) / b.length;
		return [...groups.values()].sort((a, b) => mean(a) - mean(b));
	});
	blocks.forEach((bs, g) => (rows[g] = bs.flat()));
	/** A row's blocks sorted by the average place of their relatives in the row above (down) or below (up); blocks
	 *  with none that way keep their slots. */
	const sortRow = (g: number, down: boolean) => {
		const other = rows[down ? g - 1 : g + 1];
		const O = new Map(other.map((u, i) => [u, i]));
		const pulls = (u: Unit): number[] =>
			down
				? (parentFams.get(u) ?? []).filter((fm) => O.has(fm.parent!)).map((fm) => at(O, fm.parent!, fm.anchorOff))
				: (famsOf.get(u) ?? []).flatMap((fm) => fm.kids.filter((k) => O.has(k)).map((k) => at(O, k, childLeft(k, fm) + childW(k) / 2)));
		const keyed = blocks[g].map((b, i) => {
			const ps = b.flatMap(pulls);
			return { b, i, key: ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : undefined };
		});
		const moving = keyed.filter((k) => k.key !== undefined).sort((x, y) => x.key! - y.key! || x.i - y.i);
		let m = 0;
		blocks[g] = keyed.map((k) => (k.key === undefined ? k.b : moving[m++].b));
		// Brothers and sisters (one family's run) sorted the same way, by where their own lines go; age order is
		// only a preference (those with no lines that way keep their places).
		blocks[g] = blocks[g].map((b) => {
			if (!single(b)) return b;
			const ks = b.map((u, i) => {
				const ps = pulls(u);
				return { u, i, key: !u.ghost && ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : undefined };
			});
			const mv = ks.filter((k) => k.key !== undefined).sort((x, y) => x.key! - y.key! || x.i - y.i);
			let j = 0;
			return ks.map((k) => (k.key === undefined ? k.u : mv[j++].u));
		});
		rows[g] = blocks[g].flat();
	};
	/** A block that is one family's children (no in-law families joined to it). */
	const single = (b: Unit[]) => {
		const f = sibFams(b[0]);
		return b.every((u) => sibFams(u).length === 1 && sibFams(u)[0] === f[0]);
	};
	// Preferences, below tangles: brothers and sisters in age order, partners in their usual order.
	const ageRank = new Map<Unit, number>();
	for (const fm of fams) fm.kids.forEach((k, i) => ageRank.set(k, i));
	const usual = new Map(units.map((u) => [u, u.members.join()]));
	const soft = () => {
		let n = 0;
		for (const row of rows)
			for (let i = 0; i + 1 < row.length; i++)
				if (related(row[i], row[i + 1]) && (ageRank.get(row[i]) ?? 0) > (ageRank.get(row[i + 1]) ?? 0)) n++;
		for (const u of units) if (u.members.join() !== usual.get(u)) n++;
		return n;
	};
	/** Roughly how long the lines are, without placing anyone: each row packed from its order and centred, and the
	 *  distance from each family's anchor to its children, in card widths. */
	const lineReach = () => {
		const X = new Map<Unit, number>();
		for (const row of rows) {
			let x = 0;
			for (const u of row) X.set(u, x), (x += u.w + SIB_GAP);
			for (const u of row) X.set(u, X.get(u)! - x / 2);
		}
		let n = 0;
		for (const fm of fams)
			if (fm.parent && X.has(fm.parent))
				for (const k of fm.kids) if (X.has(k)) n += Math.abs(X.get(fm.parent)! + fm.anchorOff - X.get(k)! - childLeft(k, fm) - childW(k) / 2);
		return n / W;
	};
	/** The rules for couples whose parents are both in view, for any unit (someone between two partners too): the
	 *  couple isn't crossed under their parents, and one partner's brothers and sisters are all on their own side. */
	const pairRules = () => {
		let n = 0;
		const idx = rows.map((r) => new Map(r.map((u, i) => [u, i])));
		const px = (m: string) => {
			const u = unitOf.get(m)!;
			return idx[u.g].has(u) ? at(idx[u.g], u, cardLeft(u, m) + W / 2) : undefined;
		};
		const oneSide = (xs: number[], p: number) => xs.every((v) => v < p) || xs.every((v) => v > p);
		for (const ps of pairs) {
			if (ps.some((p) => px(p) === undefined)) continue;
			const [a, b] = [...ps].sort((p, q) => px(p)! - px(q)!);
			const fa = childOf.get(a)!,
				fb = childOf.get(b)!;
			if (fa.parent!.g === fb.parent!.g && at(idx[fa.parent!.g], fa.parent!, fa.anchorOff) > at(idx[fb.parent!.g], fb.parent!, fb.anchorOff)) n++;
			const sibs = (m: string, fm: Fam) => fm.cs.filter((c) => c !== m && !married.has(c)).map(px).filter((x): x is number => x !== undefined);
			const A = px(a)!,
				B = px(b)!;
			const ls = sibs(a, fa),
				rs = sibs(b, fb);
			if (ls.every((v) => v < A) || rs.every((v) => v > B)) continue;
			if ((linkCount.get(pairKey(fa, fb)) ?? 0) > 1 && (oneSide(ls, A) || oneSide(rs, B))) continue;
			n++;
		}
		return n;
	};
	/** How good the order is: the couple rules broken, then crossings with line length and the preferences added. */
	const now = () => [pairRules(), crossingCount() + REACH * lineReach() + SOFT * soft()];
	const lt = (a: number[], b: number[]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1] - 1e-6);
	const keep = () => ({ s: now(), blocks: blocks.map((bs) => bs.map((b) => [...b])), members: units.map((u) => [...u.members]) });
	const put = (t: ReturnType<typeof keep>) => {
		t.blocks.forEach((bs, g) => ((blocks[g] = bs.map((b) => [...b])), (rows[g] = blocks[g].flat())));
		units.forEach((u, i) => (u.members = [...t.members[i]]));
		for (const fm of fams) if (fm.parent) setAnchor(fm);
	};
	let best = keep();
	const start = best;
	// Seed rows: the widest few. From each, the rows above are ordered from the row below them (ancestors over
	// their descendants), the rows below from the row above, then whole sweeps both ways.
	const seeds = [...rows.keys()].sort((a, b) => rows[b].length - rows[a].length || b - a).slice(0, SEEDS);
	for (const seed of seeds) {
		put(start);
		for (let g = seed - 1; g >= 0; g--) sortRow(g, false);
		for (let g = seed + 1; g < rows.length; g++) sortRow(g, true);
		for (let s = 0; s <= SWEEPS; s++) {
			if (s) {
				const down = s % 2 === 0;
				for (const g of down ? [...rows.keys()].slice(1) : [...rows.keys()].reverse().slice(1)) sortRow(g, down);
			}
			const sc = now();
			if (lt(sc, best.s)) best = keep();
		}
	}
	put(best);
	// Then small changes kept while they help (the sweeps settle on averages, which can leave a pair the wrong way
	// round): neighbouring blocks swapped, neighbouring brothers and sisters swapped, a block mirrored, a couple (or
	// someone between partners) turned round.
	let cur = best.s;
	const tryMove = (g: number, change: () => void, undo: () => void) => {
		change();
		rows[g] = blocks[g].flat();
		const sc = now();
		if (lt(sc, cur)) return (cur = sc), true;
		undo();
		rows[g] = blocks[g].flat();
		return false;
	};
	/** A block mirrored, the "more expected" placeholders keeping their places. */
	const mirrorBlock = (blk: Unit[]) => {
		const is = blk.flatMap((u, i) => (u.ghost ? [] : [i])),
			us = is.map((i) => blk[i]).reverse();
		is.forEach((i, j) => (blk[i] = us[j]));
	};
	const flip = (u: Unit) => {
		u.members.reverse();
		for (const fm of fams) if (fm.parent === u) setAnchor(fm);
	};
	for (let round = 0; round < ROUNDS; round++) {
		let improved = false;
		for (let g = 0; g < rows.length; g++) {
			const bs = blocks[g];
			for (let b = 0; b + 1 < bs.length; b++) {
				const sw = () => ([bs[b], bs[b + 1]] = [bs[b + 1], bs[b]]);
				if (tryMove(g, sw, sw)) improved = true;
			}
			for (const blk of bs) {
				const rev = () => mirrorBlock(blk);
				if (blk.length > 1 && tryMove(g, rev, rev)) improved = true;
				// (brothers and sisters only, also within a block joined to an in-law family)
				for (let i = 0; i + 1 < blk.length; i++) {
					if (!related(blk[i], blk[i + 1]) || blk[i].ghost || blk[i + 1].ghost) continue;
					const sw = () => ([blk[i], blk[i + 1]] = [blk[i + 1], blk[i]]);
					if (tryMove(g, sw, sw)) improved = true;
				}
				for (const u of blk) if (u.members.length > 1 && tryMove(g, () => flip(u), () => flip(u))) improved = true;
			}
		}
		// A couple turned round, with the rows above and below re-sorted from theirs: their families' sides swap,
		// which no change to one row can do.
		for (const u of new Set(pairs.map(([a]) => unitOf.get(a)!)))
			for (const mirror of [false, true]) {
				const t = keep();
				flip(u);
				// (and the couple's run of brothers and sisters and in-laws mirrored with them)
				const blk = blocks[u.g].find((b) => b.includes(u))!;
				if (mirror) mirrorBlock(blk);
				rows[u.g] = blocks[u.g].flat();
				for (let g = u.g - 1; g >= 0; g--) sortRow(g, false);
				for (let g = u.g + 1; g < rows.length; g++) sortRow(g, true);
				const sc = now();
				if (lt(sc, cur)) (cur = sc), (improved = true);
				else put(t);
			}
		if (!improved) break;
	}
	sweep();

	// 4. Read off positions; the focus person (if any) sits at x = 0.
	const nodes: NodeBox[] = [],
		ghosts: GhostBox[] = [];
	for (const u of units) {
		const y = u.g * (S.h + ROW_GAP);
		if (u.ghost) ghosts.push({ familyId: u.ghost.id, x: u.x, y, missing: missingCount(u.ghost) });
		else u.members.forEach((m) => nodes.push({ id: m, x: u.x + cardLeft(u, m), y }));
	}
	const focusNode = root ? nodes.find((n) => n.id === root) : undefined;
	const dx = focusNode ? -(focusNode.x + W / 2) : -Math.min(...nodes.map((n) => n.x), ...ghosts.map((g) => g.x));
	// (Rounded, so the focus person sits at exactly 0 whatever rounding the sums picked up.)
	for (const b of [...nodes, ...ghosts]) b.x = Math.round((b.x + dx) * 1000) / 1000;
	return { nodes, ghosts };
}

const partnerCount = (partners: Map<string, unknown[]>, p: string) => partners.get(p)?.length ?? 0;

/** Where a couple's line to their children leaves their unit, from the partners' card offsets (l < r). Side by side:
 *  the middle of the gap between them. Otherwise (someone between them): the gap just inside the "outer" partner,
 *  the one with fewer partners, since the gaps beside the person they share are used by their other couples. */
export function anchorOffset(l: number, r: number, outerLeft: boolean, W: number): number {
	if (r - l === W + CARD_GAP) return l + W + CARD_GAP / 2;
	return outerLeft ? l + W + CARD_GAP / 2 : r - CARD_GAP / 2;
}

/** Arrange people joined by partnerships on one row. A couple: father left. Someone with several partners sits
 *  between them, earlier partnerships on the left (the first half, rounding up), later ones on the right; each
 *  partner's own other partners sit next to them, further out. */
function arrange(group: string[], partners: Map<string, { p: string; f: Family }[]>, d: Dataset): string[] {
	const birth = byBirth(d);
	if (group.length === 1) return group;
	if (group.length === 2) return [...group].sort((a, b) => sexRank(d, a) - sexRank(d, b) || birth(a, b));
	const deg = (p: string) => partners.get(p)?.length ?? 0;
	const hub = [...group].sort((a, b) => deg(b) - deg(a) || birth(a, b))[0];
	const order = [hub];
	const byStart = (l: { p: string; f: Family }[]) => [...l].sort((a, b) => relStart(a.f) - relStart(b.f) || birth(a.p, b.p));
	const ps = byStart(partners.get(hub)!).map((x) => x.p);
	const left = ps.slice(0, Math.ceil(ps.length / 2)),
		right = ps.slice(Math.ceil(ps.length / 2));
	order.unshift(...left);
	order.push(...right);
	// Partners' other partners go further out on their side.
	for (let i = 0; i < order.length; i++) {
		const p = order[i];
		const more = byStart(partners.get(p) ?? []).map((x) => x.p).filter((q) => !order.includes(q));
		if (!more.length) continue;
		if (i < order.indexOf(hub)) order.splice(i, 0, ...more.reverse());
		else order.splice(i + 1, 0, ...more);
	}
	for (const p of group) if (!order.includes(p)) order.push(p);
	return order;
}

/** Place units within rows: alternately pull children under their parents and parents over their children,
 *  keeping each row's order and minimum gaps (weighted isotonic regression, "pool adjacent violators"). */
function sweepX(
	rows: Unit[][],
	famsOf: Map<Unit, Fam[]>,
	parentFams: Map<Unit, Fam[]>,
	childLeft: (k: Unit, fm: Fam) => number,
	childW: (k: Unit) => number,
	iterations = 12,
	orphanSibs = new Map<Unit, Unit[]>()
) {
	const gapAfter = (a: Unit, b: Unit) => {
		const pa = parentFams.get(a) ?? [],
			pb = parentFams.get(b) ?? [];
		return pa.some((f) => pb.includes(f)) || orphanSibs.get(a)?.includes(b) ? SIB_GAP : FAM_GAP;
	};
	const gapsOf = (row: Unit[]) => row.map((u, i) => (i < row.length - 1 ? u.w + gapAfter(u, row[i + 1]) : 0));
	type Want = { x: number; wt: number };
	const place = (row: Unit[], want: Want[] | ((u: Unit, i: number) => Want)) => {
		const go = (w: Want[]) => {
			const xs = isotonic(w, gapsOf(row), row.map((u, i) => i < row.length - 1 && gapAfter(u, row[i + 1]) === SIB_GAP));
			row.forEach((u, i) => (u.x = xs[i]));
		};
		if (Array.isArray(want)) return go(want);
		go(row.map(want));
		// Someone kept beside a brother or sister aims at where they were; once more, at where they are now.
		if (row.some((u) => orphanSibs.has(u))) go(row.map(want));
	};
	/** With nothing above or below to aim at: beside the nearest brother or sister whose parents aren't in view
	 *  (packed up against them), else stay put. */
	const rest = (row: Unit[], i: number) => {
		const u = row[i];
		const js = (orphanSibs.get(u) ?? []).map((s) => row.indexOf(s)).filter((j) => j >= 0);
		if (!js.length) return { x: u.x, wt: 0.3 };
		const j = js.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a));
		const gaps = gapsOf(row);
		let off = 0;
		for (let k = Math.min(i, j); k < Math.max(i, j); k++) off += gaps[k];
		return { x: row[j].x + (j > i ? -off : off), wt: 1 };
	};
	// Start: pack each row from the left (units already positioned keep their place).
	for (const row of rows) place(row, row.map((u) => ({ x: u.x, wt: 1 })));
	const down = (row: Unit[]) =>
		place(row, (u, i) => {
			const ws = (parentFams.get(u) ?? []).filter((fm) => fm.parent).map((fm) => fm.parent!.x + fm.anchorOff - childLeft(u, fm) - childW(u) / 2);
			return ws.length ? { x: ws.reduce((a, b) => a + b, 0) / ws.length, wt: 1 } : rest(row, i);
		});
	const up = (row: Unit[]) =>
		place(row, (u, i) => {
			const ws = (famsOf.get(u) ?? []).map((fm) => {
				const xs = fm.kids.map((k) => k.x + childLeft(k, fm));
				const lo = Math.min(...xs),
					hi = Math.max(...fm.kids.map((k) => k.x + childLeft(k, fm) + childW(k)));
				return (lo + hi) / 2 - fm.anchorOff;
			});
			return ws.length ? { x: ws.reduce((a, b) => a + b, 0) / ws.length, wt: 1 } : rest(row, i);
		});
	for (let it = 0; it < iterations; it++) {
		for (let g = 1; g < rows.length; g++) down(rows[g]);
		for (let g = rows.length - 2; g >= 0; g--) up(rows[g]);
	}
	// The passes end with parents moving over their children, which can leave children with none of their own
	// behind under where their parents were. So those go back under their parents, as far as there's room; anyone
	// with children in view stays put (so nothing below moves).
	for (let g = 1; g < rows.length; g++)
			place(rows[g], (u) => {
				if (famsOf.get(u)?.length) return { x: u.x, wt: 20 };
				const ws = (parentFams.get(u) ?? []).filter((fm) => fm.parent).map((fm) => fm.parent!.x + fm.anchorOff - childLeft(u, fm) - childW(u) / 2);
				return ws.length ? { x: ws.reduce((a, b) => a + b, 0) / ws.length, wt: 1 } : { x: u.x, wt: 20 };
			});
}

/** Positions closest (weighted least squares) to the wanted ones, keeping order with x[i+1] ≥ x[i] + gaps[i]
 *  (exactly that where `tied[i]`: kept packed together). */
export function isotonic(want: { x: number; wt: number }[], gaps: number[], tied: boolean[] = []): number[] {
	const off: number[] = [];
	want.forEach((_, i) => (off[i] = i ? off[i - 1] + gaps[i - 1] : 0));
	const blocks: { w: number; s: number; n: number }[] = [];
	want.forEach(({ x, wt }, i) => {
		const b = { w: wt, s: wt * (x - off[i]), n: 1 };
		if (i && tied[i - 1]) {
			const a = blocks.pop()!;
			blocks.push({ w: a.w + b.w, s: a.s + b.s, n: a.n + 1 });
		} else blocks.push(b);
		while (blocks.length > 1) {
			const b = blocks[blocks.length - 1],
				a = blocks[blocks.length - 2];
			if (a.s / a.w <= b.s / b.w) break;
			blocks.splice(-2, 2, { w: a.w + b.w, s: a.s + b.s, n: a.n + b.n });
		}
	});
	const out: number[] = [];
	for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.s / b.w + off[out.length]);
	return out;
}

/** Lay out each group of people (focus view: one group, with the focus person at x = 0), side by side. */
export function layoutPositions(d: Dataset, branches: { label: string; ids: string[] }[], root?: string, S: CardSize = cardSize()): Positions {
	const W = S.w;
	const out: Positions = { nodes: [], ghosts: [], labels: [], bounds: { x: 0, y: 0, w: 0, h: 0 }, cardW: W, size: S };
	let right = -Infinity;
	for (const b of branches) {
		if (!b.ids.length) continue;
		const L = layoutComponent(d, b.ids, branches.length === 1 ? root : undefined, S);
		const lefts = [...L.nodes.map((n) => n.x), ...L.ghosts.map((g) => g.x)];
		const dx = right === -Infinity ? 0 : right + COMP_GAP - Math.min(...lefts);
		for (const n of L.nodes) out.nodes.push({ ...n, x: n.x + dx });
		for (const g of L.ghosts) out.ghosts.push({ ...g, x: g.x + dx });
		if (branches.length > 1) out.labels.push({ text: b.label, x: Math.min(...lefts) + dx, y: -LABEL_DY });
		right = Math.max(...L.nodes.map((n) => n.x + W), ...L.ghosts.map((g) => g.x + S.ghost)) + dx;
	}
	const boxes = [...out.nodes.map((n) => ({ ...n, w: W })), ...out.ghosts.map((g) => ({ ...g, w: S.ghost }))];
	if (boxes.length) {
		const x0 = Math.min(...boxes.map((b) => b.x)),
			y0 = Math.min(...boxes.map((b) => b.y), ...out.labels.map((l) => l.y - 14)),
			x1 = Math.max(...boxes.map((b) => b.x + b.w)),
			y1 = Math.max(...boxes.map((b) => b.y + S.h));
		out.bounds = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	return out;
}
