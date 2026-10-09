// Shared app state (Svelte 5 runes). The dataset is a deep $state proxy, so the plain mutation
// functions in model/mutations.ts trigger UI updates directly.
import type { Dataset } from './model/types.ts';
import type { RelativeKind } from './model/mutations.ts';
import type { Camera } from './layout/viewport.ts';
import type { DataStore } from './storage/index.ts';
import { betterThumb, prepareImage } from './media/images.ts';
import { SNOOZE, backupDue, requestPersistence, type Kept } from './storage/safety.ts';
import { removePhoto, setPhoto } from './model/media.ts';
import { emptyDataset, uid } from './model/mutations.ts';
import { DEFAULT_FOCUS, focusSet, type FocusOptions } from './model/focus.ts';
import { components, displayName, person, primaryName } from './model/queries.ts';
import { addView, focusScope, sameFocus, setViewScope, viewFocus, viewKind, viewMembers, type FocusRule } from './model/views.ts';
import { migrate } from './model/migrate.ts';
import demo from './data/demo-darwin.json';

export type Tab = 'tree' | 'timeline' | 'map' | 'todo';
export type Focus = FocusRule;

/** The demo family (E4): the Darwins and Wedgwoods, offered on an empty tree but never loaded unasked. */
export const demoData = (): Dataset => migrate(structuredClone(demo) as unknown as Dataset);

/** Label for an unconnected group on the canvas: its most common birth surname. */
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
// Per-browser display preferences (not part of the family data).
const PREFS = 'family-tree:prefs';
function readPref<T>(k: string, dflt: T): T {
	try {
		return (JSON.parse(localStorage.getItem(PREFS) ?? '{}')[k] as T) ?? dflt;
	} catch {
		return dflt;
	}
}
function writePref(k: string, v: unknown) {
	try {
		localStorage.setItem(PREFS, JSON.stringify({ ...JSON.parse(localStorage.getItem(PREFS) ?? '{}'), [k]: v }));
	} catch {
		/* ignore */
	}
}

const labelled = (d: Dataset, comps: string[][]) => comps.map((ids) => ({ label: branchLabel(d, ids), ids }));

class AppState {
	data = $state<Dataset>(emptyDataset());
	/** Saved data has been loaded (until then nothing is shown or saved). */
	ready = $state(false);
	/** Where data and photos are kept (set on start-up). */
	store: DataStore | null = null;
	/** Show photos on tree cards (V10). Off = compact cards. A per-browser preference, not part of the data. */
	showPhotos = $state(readPref('showPhotos', true));
	tab = $state<Tab>('tree');
	selected = $state<string | null>(null);
	/** Which "add relative" form is open in the person panel. */
	addKind = $state<RelativeKind | null>(null);
	showData = $state(false);

	/** Keeping the tree safe (E5): whether the browser agreed to keep our data (null = not asked yet), and when
	 *  the last backup was downloaded. Per-browser, so kept with the preferences rather than in the data. */
	kept = $state<Kept | null>(null);
	backedUpAt = $state<number | null>(readPref('backedUpAt', null));
	/** When the first change not in a backup was made. */
	unbackedSince = $state<number | null>(readPref('unbackedSince', null));
	backupSnoozedUntil = $state<number | null>(readPref('backupSnoozedUntil', null));
	/** The next data change is a replacement (a backup, the demo, or an empty start), not an edit. */
	replacing = false;
	get backupDue() {
		return backupDue({ unbackedSince: this.unbackedSince, snoozedUntil: this.backupSnoozedUntil }, Date.now());
	}
	/** Tree pan/zoom. null = fit everything next time the tree is drawn. Kept here so it survives tab switches. */
	camera = $state<Camera | null>(null);
	/** Person the tree view should move to; it clears this once done. */
	centreTarget = $state<string | null>(null);

	/** Focus mode (V3/V4): show only this person's family. Filters every tab. Mirrored in the page address. */
	focus = $state<Focus | null>(null);
	/** The focus, unless its person has been deleted. */
	activeFocus = $derived(this.focus && person(this.data, this.focus.id) ? this.focus : null);
	focusView = $derived(this.activeFocus ? focusSet(this.data, this.activeFocus.id, this.activeFocus) : null);

	/** The saved view (V5/V6) that's open, if any. A focus view also sets `focus`, which can then be adjusted. */
	viewId = $state<string | null>(null);
	activeView = $derived(this.data.views.find((v) => v.id === this.viewId) ?? null);
	/** An open focus view whose focus has since been changed (offer "Update view"). */
	viewChanged = $derived(!!this.activeView && viewKind(this.activeView) === 'focus' && !sameFocus(viewFocus(this.activeView), this.activeFocus));

	/** Hand-picking people for a view: the ids picked so far (everyone is shown meanwhile), or null. */
	picked = $state<string[] | null>(null);
	/** The hand-picked view being edited, or null when picking for a new one. */
	pickingFor = $state<string | null>(null);

	/** Reset (V2): an empty canvas with nobody shown or selected, until you search, open a view or show everyone. */
	blank = $state(false);

	/** Everyone, as unconnected groups. */
	branches = $derived(labelled(this.data, components(this.data)));
	visibleBranches = $derived.by(() => {
		if (this.picked) return this.branches;
		if (this.blank) return [];
		if (this.focusView) return [{ label: '', ids: [...this.focusView.ids] }];
		if (this.activeView && viewKind(this.activeView) !== 'focus') return labelled(this.data, components(this.data, viewMembers(this.data, this.activeView)));
		return this.branches;
	});
	visibleIds = $derived(this.visibleBranches.flatMap((b) => b.ids));
	#visibleSet = $derived(new Set(this.visibleIds));
	inView = (id: string) => this.#visibleSet.has(id);

	/** Fit the whole tree. Only for explicit actions (load, Fit, view change), never ordinary edits. */
	fitTree() {
		this.camera = null;
	}

	/** Show everyone: no focus, no saved view. */
	showEveryone() {
		this.blank = false;
		this.focus = null;
		this.viewId = null;
		this.picked = null;
		this.pickingFor = null;
		this.fitTree();
	}

	openView(id: string) {
		const v = this.data.views.find((v) => v.id === id);
		if (!v) return;
		this.blank = false;
		this.viewId = id;
		this.focus = viewFocus(v);
		this.fitTree();
	}

	/** Show this person in the middle of the tree (keeping the zoom) and select them.
	 *  If the current focus or view hides them, this goes back to showing everyone. */
	centreOn(id: string) {
		this.tab = 'tree';
		if (!this.inView(id)) {
			this.blank = false;
			this.focus = null;
			this.viewId = null;
		}
		this.select(id);
		this.centreTarget = id;
	}

	/** Focus on a person, keeping the current depths and width (or the defaults), unless `opts` says otherwise. */
	focusOn(id: string, opts: Partial<FocusOptions> = {}) {
		const { up, down, width } = { ...(this.activeFocus ?? DEFAULT_FOCUS), ...opts };
		// A saved view stays open only while it's still about the same person.
		if (this.activeView && viewFocus(this.activeView)?.id !== id) this.viewId = null;
		this.blank = false;
		this.focus = { id, up, down, width };
		this.fitTree();
	}

	adjustFocus(patch: Partial<FocusOptions>) {
		if (!this.focus) return;
		this.focus = { ...this.focus, ...patch };
		this.fitTree();
	}

	/** Just this person: no generations either way, so not even partners (V2). */
	collapseTo(id: string) {
		this.focusOn(id, { up: 0, down: 0 });
	}

	/** Reset (V2): clear focus, view and selection, leaving an empty canvas. */
	reset() {
		this.focus = null;
		this.viewId = null;
		this.picked = null;
		this.pickingFor = null;
		this.select(null);
		this.blank = true;
		this.fitTree();
	}

	/** Replace the (empty) tree with the demo family, and open on Charles Darwin's family. */
	loadDemo() {
		this.replaceData(demoData());
		this.select(null);
		this.openView('view_charles_family');
	}

	/** Save the current focus as a new view and open it. */
	saveFocusAsView(name: string) {
		if (!this.activeFocus) return;
		this.viewId = addView(this.data, name, focusScope(this.activeFocus)).id;
	}

	/** Store the adjusted focus back into the open view. */
	updateView() {
		if (this.activeView && this.activeFocus) setViewScope(this.data, this.activeView.id, focusScope(this.activeFocus));
	}

	/** Start hand-picking people, for a new view or to edit an existing hand-picked one. */
	startPicking(viewId: string | null = null) {
		const v = viewId ? this.data.views.find((v) => v.id === viewId) : null;
		this.picked = v ? viewMembers(this.data, v) : this.selected ? [this.selected] : [];
		this.pickingFor = v?.id ?? null;
		this.select(null);
		this.blank = false;
		this.tab = 'tree';
		this.fitTree();
	}

	togglePicked(id: string) {
		if (!this.picked) return;
		this.picked = this.picked.includes(id) ? this.picked.filter((x) => x !== id) : [...this.picked, id];
	}

	/** Save the picked people (as a new view called `name`, or into the view being edited) and open it. */
	finishPicking(name: string) {
		if (!this.picked) return;
		const people = this.picked;
		const id = this.pickingFor ?? addView(this.data, name, { people }).id;
		if (this.pickingFor) setViewScope(this.data, id, { people });
		this.picked = null;
		this.pickingFor = null;
		this.openView(id);
	}

	cancelPicking() {
		this.picked = null;
		this.pickingFor = null;
		this.fitTree();
	}

	/** Ask the browser (once) to keep our data. */
	async askToKeep() {
		if (this.kept === null) this.kept = await requestPersistence();
	}
	/** The data changed (called by the saver). Edits count towards the backup reminder; replacements don't. */
	noteChange() {
		if (this.replacing) {
			this.replacing = false;
			return;
		}
		if (!this.unbackedSince) writePref('unbackedSince', (this.unbackedSince = Date.now()));
		this.askToKeep();
	}
	/** All the data is about to be replaced: what was there no longer needs backing up. */
	replaceData(d: Dataset) {
		this.replacing = true;
		writePref('unbackedSince', (this.unbackedSince = null));
		this.data = d;
	}
	noteBackup() {
		writePref('backedUpAt', (this.backedUpAt = Date.now()));
		writePref('unbackedSince', (this.unbackedSince = null));
		writePref('backupSnoozedUntil', (this.backupSnoozedUntil = null));
	}
	snoozeBackup() {
		writePref('backupSnoozedUntil', (this.backupSnoozedUntil = Date.now() + SNOOZE));
	}

	setShowPhotos(on: boolean) {
		this.showPhotos = on;
		writePref('showPhotos', on);
	}

	/** Give someone a photo from a picked file: only a resized copy is kept (see media/images.ts). */
	async addPhoto(pid: string, file: Blob) {
		if (!this.store) throw new Error('Storage is not ready yet.');
		const img = await prepareImage(file);
		// Store the file first, so a failed write never leaves someone pointing at a photo that isn't there.
		const id = uid('media');
		await this.store.putMedia(id, img.image);
		const { replaced } = setPhoto(this.data, pid, { mime: img.mime, width: img.width, height: img.height, thumb: img.thumb }, id);
		if (replaced) await this.store.deleteMedia(replaced);
	}

	/** Remake thumbnails saved before they were made bigger and smoother, from the kept copies. */
	async refreshThumbs() {
		for (const m of this.data.media) {
			if (!m.thumb) continue;
			const kept = await this.store?.getMedia(m.id);
			const t = kept && (await betterThumb(m.thumb, kept).catch(() => undefined));
			if (t) m.thumb = t;
		}
	}

	async removePhoto(pid: string) {
		const id = removePhoto(this.data, pid);
		if (id) await this.store?.deleteMedia(id);
	}

	select(id: string | null, addKind: RelativeKind | null = null) {
		this.selected = id;
		this.addKind = addKind;
	}
}

export const app = new AppState();
