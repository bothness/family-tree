// Shared app state (Svelte 5 runes). The dataset is a deep $state proxy, so the plain mutation
// functions in model/mutations.ts trigger UI updates directly.
import type { Dataset } from './model/types.ts';
import type { RelativeKind } from './model/mutations.ts';
import type { Camera } from './layout/viewport.ts';
import { components, displayName, person, primaryName } from './model/queries.ts';
import { migrate } from './model/migrate.ts';
import sample from './data/example-data.json';

export type Tab = 'tree' | 'timeline' | 'todo';

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

	branches = $derived(components(this.data).map((ids) => ({ label: branchLabel(this.data, ids), ids })));
	visibleBranches = $derived(
		this.branch === 'all' || !this.branches.some((b) => b.label === this.branch)
			? this.branches
			: this.branches.filter((b) => b.label === this.branch)
	);
	visibleIds = $derived(this.visibleBranches.flatMap((b) => b.ids));

	/** Fit the whole tree. Only for explicit actions (load, Fit, branch change), never ordinary edits. */
	fitTree() {
		this.camera = null;
	}

	/** Show this person in the middle of the tree (keeping the zoom) and select them. */
	centreOn(id: string) {
		this.tab = 'tree';
		if (!this.visibleIds.includes(id)) this.branch = 'all';
		this.select(id);
		this.centreTarget = id;
	}

	select(id: string | null, addKind: RelativeKind | null = null) {
		this.selected = id;
		this.addKind = addKind;
	}
}

export const app = new AppState();
