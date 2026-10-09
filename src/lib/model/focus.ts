// Focus mode (V3/V4): who is shown around one person. Derived only; nothing here is stored in the dataset.
import type { Dataset } from './types.ts';
import { childIds, famAsChild, famsAsPartner, partnerIds, person } from './queries.ts';

/**
 * How wide a focus view is:
 * - direct: ancestors, descendants, and the partners of the focus person and their descendants
 * - siblings: also the brothers and sisters (half-siblings included) of everyone on the direct line,
 *   i.e. the other children of every ancestor shown (siblings, aunts and uncles…)
 * - all: also the descendants of those siblings (cousins, nieces, nephews…), no deeper than `down`, with partners
 */
export type FocusWidth = 'direct' | 'siblings' | 'all';

export interface FocusOptions {
	/** Generations of ancestors to show. 0 = none, Infinity = all. */
	up: number;
	/** Generations of descendants to show. 0 = none, Infinity = all. */
	down: number;
	width: FocusWidth;
}

/** People cut off at the edge of the view: parents above someone, or children below a family. */
export type FocusEdge =
	| { dir: 'up'; personId: string; hidden: number }
	| { dir: 'down'; familyId: string; hidden: number };

export interface FocusResult {
	ids: Set<string>;
	edges: FocusEdge[];
	/** How many generations up and down the direct line actually reaches (useful when up/down are Infinity). */
	reach: { up: number; down: number };
}

export const DEFAULT_FOCUS: FocusOptions = { up: 2, down: 1, width: 'siblings' };

export function focusSet(d: Dataset, rootId: string, o: FocusOptions): FocusResult {
	const ids = new Set<string>(),
		gen = new Map<string, number>();
	if (!person(d, rootId)) return { ids, edges: [], reach: { up: 0, down: 0 } };
	const add = (id: string, g: number) => {
		if (!person(d, id) || ids.has(id)) return false;
		ids.add(id);
		gen.set(id, g);
		return true;
	};
	add(rootId, 0);

	// Ancestors, generation by generation.
	const ancestors = [rootId];
	let frontier = [rootId];
	for (let g = 1; g <= o.up && frontier.length; g++) {
		const next: string[] = [];
		for (const id of frontier) {
			const f = famAsChild(d, id);
			if (f) for (const p of partnerIds(f)) if (add(p, -g)) next.push(p);
		}
		ancestors.push(...next);
		frontier = next;
	}

	// Descendants (with partners) below the given people, down to generation `o.down` relative to the focus person.
	const descend = (start: string[]) => {
		const seen = [...start];
		let level = start;
		while (level.length) {
			const next: string[] = [];
			for (const id of level) {
				const g = gen.get(id)!;
				for (const f of famsAsPartner(d, id)) {
					for (const p of partnerIds(f)) add(p, g);
					if (g < o.down) for (const c of childIds(f)) if (add(c, g + 1)) next.push(c);
				}
			}
			seen.push(...next);
			level = next;
		}
		return seen;
	};
	// No generations either way means "just this person" (V2 collapse): not even their partners.
	const collapsed = o.up === 0 && o.down === 0;
	const directLine = new Set(collapsed ? [rootId] : [...ancestors, ...descend([rootId])]);

	// Siblings at every generation: the other children of each ancestor shown (so never without a visible parent).
	const collateral: string[] = [];
	if (o.width !== 'direct' && !collapsed)
		for (const a of ancestors) {
			if (a !== rootId) for (const f of famsAsPartner(d, a)) for (const c of childIds(f)) if (add(c, gen.get(a)! + 1)) collateral.push(c);
			// Brothers and sisters recorded with no parents at all: there's no parent to show, so they come with
			// the siblings setting alone.
			const own = famAsChild(d, a);
			if (own && !partnerIds(own).length) for (const c of childIds(own)) if (add(c, gen.get(a)!)) collateral.push(c);
		}
	if (o.width === 'all') descend(collateral);

	// A family with a child in view and one parent in view also shows the other parent (e.g. a half-sibling's mother),
	// so sibling groups are bracketed under the right couple.
	for (const f of d.families) {
		const ps = partnerIds(f),
			shown = ps.filter((p) => ids.has(p));
		if (shown.length === 1 && childIds(f).some((c) => ids.has(c))) for (const p of ps) add(p, gen.get(shown[0])!);
	}

	// Edges: where showing one more generation up or down would reveal people.
	const edges: FocusEdge[] = [];
	for (const a of ancestors) {
		if (gen.get(a) !== -o.up) continue;
		const f = famAsChild(d, a);
		const hidden = f ? partnerIds(f).filter((p) => !ids.has(p) && person(d, p)).length : 0;
		if (hidden) edges.push({ dir: 'up', personId: a, hidden });
	}
	const extendsDown = new Set([...directLine].filter((id) => gen.get(id)! >= 0));
	if (o.width === 'all') for (const id of ids) if (!directLine.has(id)) extendsDown.add(id);
	for (const f of d.families) {
		if (!partnerIds(f).some((p) => extendsDown.has(p) && gen.get(p) === o.down)) continue;
		const hidden = childIds(f).filter((c) => !ids.has(c) && person(d, c)).length;
		if (hidden) edges.push({ dir: 'down', familyId: f.id, hidden });
	}
	const gens = [...directLine].map((id) => gen.get(id)!);
	return { ids, edges, reach: { up: -Math.min(0, ...gens), down: Math.max(0, ...gens) } };
}

const WIDTH_ORDER: FocusWidth[] = ['direct', 'siblings', 'all'];

/**
 * The smallest change to a focus view that brings `id` into it: more generations up or down and/or a wider
 * setting, counting each extra generation or width step as one. Prefers deeper over wider when tied.
 * Returns the same options if they're already in view, or null if no widening includes them (e.g. a partner's
 * parents, since focus never follows a partner's own family) within `maxExtra` generations each way.
 */
export function expandToInclude(d: Dataset, rootId: string, o: FocusOptions, id: string, maxExtra = 10): FocusOptions | null {
	let best: { o: FocusOptions; cost: number; widen: number } | null = null;
	const w0 = WIDTH_ORDER.indexOf(o.width);
	for (let wi = w0; wi < WIDTH_ORDER.length; wi++)
		for (let du = 0; du <= maxExtra; du++)
			for (let dd = 0; dd <= maxExtra; dd++) {
				const widen = wi - w0,
					cost = du + dd + widen;
				if (best && (cost > best.cost || (cost === best.cost && widen >= best.widen))) continue;
				const c = { up: o.up + du, down: o.down + dd, width: WIDTH_ORDER[wi] };
				if (focusSet(d, rootId, c).ids.has(id)) best = { o: c, cost, widen };
			}
	return best?.o ?? null;
}
