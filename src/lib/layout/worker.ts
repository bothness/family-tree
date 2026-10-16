// Lays out a big tree off the page (L4), so a slow layout never freezes it. TreeView sends what the layout reads
// (people's ids and sex, the families, birth and baptism events) and draws the answer when it comes.
import { layoutTree, type Branch, type CardSize } from './tree.ts';
import type { Dataset } from '../model/types.ts';

export interface LayoutRequest {
	id: number;
	d: Dataset;
	branches: Branch[];
	root?: string;
	size: CardSize;
	across: boolean;
}

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
	const { id, d, branches, root, size, across } = e.data;
	self.postMessage({ id, L: layoutTree(d, branches, root, size, across) });
};
