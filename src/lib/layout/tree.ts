// The family tree layout (Phase C): card positions (positions.ts), then the lines between them (connectors.ts).
// A left-to-right tree (V14) is the same layout worked out on its side: each card's width and height swapped, so
// generations stack down the page, then everything flipped across the diagonal (x ↔ y). All the rules, and the
// checks, therefore hold for both directions.
import type { Dataset } from '../model/types.ts';
import { cardSize, layoutPositions, type Box, type BranchLabel, type CardSize, type GhostBox, type NodeBox } from './positions.ts';
import { pathOf, routeConnectors, type Anchor, type Line } from './connectors.ts';

export { GHOST_W, NODE_H, NODE_W, PHOTO_W, PORTRAIT_H, PORTRAIT_NOPHOTO_H, PORTRAIT_W, cardSize } from './positions.ts';
export type { Anchor, Box, BranchLabel, CardSize, GhostBox, Line, NodeBox };
export type { LineStyle } from './connectors.ts';

export interface TreeLayout {
	nodes: NodeBox[];
	ghosts: GhostBox[];
	lines: Line[];
	labels: BranchLabel[];
	/** Where each family's line to its children starts (for markers at the edge of a focus). `bottom` is the far
	 *  edge of the parents' cards in the direction of the children (their right-hand edge in a left-to-right tree). */
	anchors: Record<string, Anchor>;
	/** Everything drawn. In a focus view the focus person is centred on x = 0, so this can start left of 0. */
	bounds: Box;
	/** Card width used (wider when photos are shown). */
	cardW: number;
	/** Sizes of the boxes the layout placed (for a left-to-right tree, before flipping: width and height swapped). */
	size: CardSize;
	/** Generations run left to right. */
	across?: boolean;
}

/** Lay out the given groups of people. `root`: the focus person, kept at x = 0 so the view grows around them
 *  (y = 0 in a left-to-right tree). `size`: the cards as drawn (a number is a card width at the normal height).
 *  `across`: generations left to right instead of top to bottom. */
export function layoutTree(d: Dataset, branches: { label: string; ids: string[] }[], root?: string, size?: number | CardSize, across = false): TreeLayout {
	const S = typeof size === 'number' ? cardSize(size) : (size ?? cardSize());
	const L = sideways(d, branches, root, across ? turn(S) : S);
	return across ? flip(L) : L;
}

/** The layout as worked out (for a left-to-right tree, before flipping): what the layout checks look at. */
export function sideways(d: Dataset, branches: { label: string; ids: string[] }[], root: string | undefined, S: CardSize): TreeLayout {
	const p = layoutPositions(d, branches, root, S);
	return { ...p, ...routeConnectors(d, p.nodes, p.ghosts, p.size) };
}

/** Card sizes for working out a left-to-right tree on its side: width and height swapped (placeholders are as
 *  big as cards there). */
export const turn = (S: CardSize): CardSize => ({ w: S.h, h: S.w, ghost: S.h });

const swap = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.y, y: p.x });

function flipLines(lines: Line[]): Line[] {
	return lines.map((l) => {
		const f = { ...l, seg: { x1: l.seg.y1, y1: l.seg.x1, x2: l.seg.y2, y2: l.seg.x2 } };
		f.d = pathOf(f);
		return f;
	});
}
const flipAnchors = (a: Record<string, Anchor>) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, swap(v)]));

/** A layout worked out on its side, turned into a left-to-right tree. */
export function flip(L: TreeLayout): TreeLayout {
	const nodes = L.nodes.map(swap),
		ghosts = L.ghosts.map(swap);
	const W = L.size.h,
		H = L.size.w;
	// Branch labels go above each group's first column.
	const labels = L.labels.map((l) => ({ text: l.text, x: 0, y: l.x - 12 }));
	const xs = [...nodes.map((n) => [n.x, n.x + W]), ...ghosts.map((g) => [g.x, g.x + W])].flat(),
		ys = [...nodes.map((n) => [n.y, n.y + H]), ...ghosts.map((g) => [g.y, g.y + H]), ...labels.map((l) => [l.y - 14])].flat();
	const bounds = xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : L.bounds;
	return { ...L, nodes, ghosts, labels, bounds, lines: flipLines(L.lines), anchors: flipAnchors(L.anchors), cardW: W, across: true };
}

/** Lines for cards drawn at in-between positions while the tree animates (flipping for a left-to-right tree). */
export function routeShown(d: Dataset, L: TreeLayout, nodes: NodeBox[], ghosts: GhostBox[]): { lines: Line[]; anchors: Record<string, Anchor> } {
	if (!L.across) return routeConnectors(d, nodes, ghosts, L.size);
	const r = routeConnectors(d, nodes.map(swap), ghosts.map(swap), L.size);
	return { lines: flipLines(r.lines), anchors: flipAnchors(r.anchors) };
}
