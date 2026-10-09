// The family tree layout (Phase C): card positions (positions.ts), then the lines between them (connectors.ts).
import type { Dataset } from '../model/types.ts';
import { layoutPositions, type Box, type BranchLabel, type GhostBox, type NodeBox } from './positions.ts';
import { routeConnectors, type Anchor, type Line } from './connectors.ts';

export { GHOST_W, NODE_H, NODE_W, PHOTO_W } from './positions.ts';
export type { Anchor, Box, BranchLabel, GhostBox, Line, NodeBox };
export type { LineStyle } from './connectors.ts';

export interface TreeLayout {
	nodes: NodeBox[];
	ghosts: GhostBox[];
	lines: Line[];
	labels: BranchLabel[];
	/** Where each family's line to its children starts (for markers at the edge of a focus). */
	anchors: Record<string, Anchor>;
	/** Everything drawn. In a focus view the focus person is centred on x = 0, so this can start left of 0. */
	bounds: Box;
	/** Card width used (wider when photos are shown). */
	cardW: number;
}

/** Lay out the given groups of people. `root`: the focus person, kept at x = 0 so the view grows around them.
 *  `cardW`: card width (NODE_W, or PHOTO_W when photos are shown). */
export function layoutTree(d: Dataset, branches: { label: string; ids: string[] }[], root?: string, cardW?: number): TreeLayout {
	const p = layoutPositions(d, branches, root, cardW);
	return { ...p, ...routeConnectors(d, p.nodes, p.ghosts, p.cardW) };
}
