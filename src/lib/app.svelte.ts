// Shared app state (Svelte 5 runes). The dataset is a deep $state proxy, so the plain mutation
// functions in model/mutations.ts trigger UI updates directly.
import type { Dataset } from './model/types.ts';
import type { RelativeKind } from './model/mutations.ts';
import type { Camera } from './layout/viewport.ts';
import { DEFAULT_FOCUS, focusSet, type FocusOptions } from './model/focus.ts';
import { components, displayName, person, primaryName } from './model/queries.ts';
import { migrate } from './model/migrate.ts';
import sample from './data/example-data.json';

export type Tab = 'tree' | 'timeline' | 'todo';
export interface Focus extends FocusOptions {
	id: string;
}

export const sampleData = (): Dataset => migrate(structuredClone(sample));

function branchLabel(d: Dataset, comp: string[]): string {
	const counts: Record<string, number> = {};
	for (const id of comp) {
		const p = person(d, id);
		if (!p || p.placeholder) continue;
		const s = p.names?.find((n) => n.type === 'birth' || !n.type)?.surname ?? primaryName(p)?.surname;
		if (s) counts[s] = (counts[s] ?? 0) + 1;
	}
	const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
	return top ? top[0] : displayName(person(d, comp[0]));
}

class AppState {
	data = $state<Dataset>(sampleData());
	tab = $state<Tab>('tree');
	/** Interim: auto-detected unconnected groups. Replaced by saved views in Phase B. */
	branch = $state<string>('all');
	selected = $state<string | null>(null);
	/** Which "add relative" form is open in the person panel. */
	addKind = $state<RelativeKind | null>(null);
	showData = $state(false);
	/** Tree pan/zoom. null = fit everything next time the tree is drawn. Kept here so it survives tab switches. */
	camera = $state<Camera | null>(null);
	/** Person the tree view should move to; it clears this once done. */
	centreTarget = $state<string | null>(null);

	/** Focus mode (V3/V4): show only this person's family. Filters every tab. Mirrored in the page address. */
	focus = $state<Focus | null>(null);
	/** The focus, unless its person has been deleted. */
	activeFocus = $derived(this.focus && person(this.data, this.focus.id) ? this.focus : null);
	focusView = $derived(this.activeFocus ? focusSet(this.data, this.activeFocus.id, this.activeFocus) : null);

	branches = $derived(components(this.data).map((ids) => ({ label: branchLabel(this.data, ids), ids })));
	visibleBranches = $derived(
		this.focusView
			? [{ label: '', ids: [...this.focusView.ids] }]
			: this.branch === 'all' || !this.branches.some((b) => b.label === this.branch)
				? this.branches
				: this.branches.filter((b) => b.label === this.branch)
	);
	visibleIds = $derived(this.visibleBranches.flatMap((b) => b.ids));
	#visibleSet = $derived(new Set(this.visibleIds));
	inView = (id: string) => this.#visibleSet.has(id);

	/** Fit the whole tree. Only for explicit actions (load, Fit, branch change), never ordinary edits. */
	fitTree() {
		this.camera = null;
	}

	/** Show this person in the middle of the tree (keeping the zoom) and select them.
	 *  If they're hidden by focus or a branch filter, this goes back to showing everyone. */
	centreOn(id: string) {
		this.tab = 'tree';
		if (!this.inView(id)) {
			this.focus = null;
			this.branch = 'all';
		}
		this.select(id);
		this.centreTarget = id;
	}

	/** Focus on a person, keeping the current depths and width (or the defaults). */
	focusOn(id: string) {
		const { up, down, width } = this.activeFocus ?? DEFAULT_FOCUS;
		this.focus = { id, up, down, width };
		this.fitTree();
	}

	adjustFocus(patch: Partial<FocusOptions>) {
		if (!this.focus) return;
		this.focus = { ...this.focus, ...patch };
		this.fitTree();
	}

	clearFocus() {
		this.focus = null;
		this.fitTree();
	}

	select(id: string | null, addKind: RelativeKind | null = null) {
		this.selected = id;
		this.addKind = addKind;
	}
}

export const app = new AppState();
