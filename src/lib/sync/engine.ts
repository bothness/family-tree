// Syncing the family edition (F2). Wraps the browser store: the app keeps working on its own copy (offline too)
// and the engine keeps it in step with the shared copy on the server.
//
// - The server keeps numbered versions. A save says which version it's based on and only succeeds if that's
//   still the newest; otherwise the server sends the newest back, the engine merges (merge.ts) and tries again.
// - The engine remembers the last version it synced (`synced`), the base for every merge, on this device.
// - Before sending, what changed since `synced` is stamped with when and by whom, so clashes go to the newer edit.
// - Changes from others are merged with what's on screen and handed to the app (`onData`), which applies them in
//   place (patch.ts), so nothing being edited is rebuilt.
// - A device that has never synced takes the shared tree as it is; anything it had is kept aside (`before-sync`),
//   never merged in (so a demo or a test tree can't leak into the family's data).
// - Photos are uploaded when added (retried until they go) and fetched from the server when a device lacks one.
import type { Dataset } from '../model/types.ts';
import type { DataStore } from '../storage/index.ts';
import { eq, merge3, normalise, stampChanges } from './merge.ts';

export interface Snapshot {
	version: number;
	data: Dataset;
}
export type PushResult = { ok: true; version: number } | { ok: false; latest: Snapshot };

/** The server, as the engine sees it. */
export interface Remote {
	/** The newest saved version, or null if nothing has been saved yet. */
	pull(): Promise<Snapshot | null>;
	/** Save `data` as the version after `base` (0 = the first save), unless someone saved since. */
	push(base: number, data: Dataset): Promise<PushResult>;
	getMedia(id: string): Promise<Blob | null>;
	putMedia(id: string, blob: Blob): Promise<void>;
}

/** Why the server couldn't be reached or refused: offline (or the server is down), not signed in, not invited. */
export class RemoteError extends Error {
	constructor(
		public kind: 'offline' | 'signed-out' | 'forbidden',
		message = kind
	) {
		super(message);
	}
}

export type SyncStatus = 'starting' | 'saving' | 'saved' | 'offline' | 'signed-out' | 'forbidden';

interface State {
	synced: Snapshot | null;
	/** Photos added on this device that haven't reached the server yet. */
	unsentMedia: string[];
}

export interface SyncOptions {
	local: DataStore;
	remote: Remote;
	/** Who is editing (their email), for the stamps. */
	who: () => string;
	/** Changes from others, merged with what the app had (`appHad`): the app should bring its data up to `next`,
	 *  keeping any edits made since it last saved (see `applyIncoming`). */
	onData: (next: Dataset, appHad: Dataset) => void;
	onStatus?: (s: SyncStatus) => void;
}

const STATE_KEY = 'sync';
const empty = (): Dataset => normalise({ schemaVersion: '0.2', people: [], families: [], events: [], places: [], sources: [], views: [], media: [] });

export function createSync(o: SyncOptions) {
	let state: State = { synced: null, unsentMedia: [] };
	/** The app's data as the engine last saw it (saved by the app, or handed to it). */
	let appHas: Dataset = empty();
	let status: SyncStatus = 'starting';
	const setStatus = (s: SyncStatus) => {
		if (s === status) return;
		status = s;
		o.onStatus?.(s);
	};
	const saveState = () => o.local.putExtra(STATE_KEY, state);

	// One sync at a time, in order.
	let queue: Promise<unknown> = Promise.resolve();
	const serial = <T>(f: () => Promise<T>) => {
		const p = queue.then(f, f);
		queue = p.catch(() => {});
		return p;
	};
	const failed = (e: unknown) => {
		if (e instanceof RemoteError) setStatus(e.kind);
		else {
			console.error('Sync failed', e);
			setStatus('offline');
		}
	};

	/** Hand merged changes to the app and keep them locally. */
	async function give(next: Dataset) {
		const had = appHas;
		appHas = structuredClone(next);
		await o.local.save(next);
		if (!eq(next, had)) o.onData(structuredClone(next), had);
	}

	/** Send this device's changes, merging and retrying if someone else saved first. */
	async function pushNow() {
		let base = state.synced;
		if (!base) return;
		let mine = normalise(appHas);
		stampChanges(base.data, mine, o.who());
		for (let attempt = 0; attempt < 5; attempt++) {
			if (eq(mine, base.data)) {
				setStatus('saved');
				return;
			}
			setStatus('saving');
			const r = await o.remote.push(base.version, mine);
			if (r.ok) {
				state = { ...state, synced: { version: r.version, data: structuredClone(mine) } };
				await saveState();
				setStatus('saved');
				return;
			}
			// Someone saved first: merge their version with ours and try again on top of theirs.
			const merged = merge3(base.data, mine, r.latest.data).data;
			base = r.latest;
			state = { ...state, synced: base };
			await saveState();
			await give(merged);
			mine = merged;
		}
		throw new Error('Too many people saving at once; will try again.');
	}

	async function sendMedia() {
		for (const id of [...state.unsentMedia]) {
			const b = await o.local.getMedia(id);
			if (b) await o.remote.putMedia(id, b);
			state = { ...state, unsentMedia: state.unsentMedia.filter((x) => x !== id) };
			await saveState();
		}
	}

	/** Fetch others' changes (and send ours). */
	async function pullNow() {
		const latest = await o.remote.pull();
		if (!state.synced) return;
		if (latest && latest.version > state.synced.version) {
			const merged = merge3(state.synced.data, normalise(appHas), latest.data).data;
			state = { ...state, synced: latest };
			await saveState();
			await give(merged);
		}
		await pushNow();
		await sendMedia();
	}

	const store: DataStore = {
		load: () => o.local.load(),
		async save(d) {
			await o.local.save(d);
			appHas = normalise(d);
			void serial(pushNow).catch(failed);
		},
		async getMedia(id) {
			const here = await o.local.getMedia(id);
			if (here) return here;
			try {
				const b = await o.remote.getMedia(id);
				if (b) await o.local.putMedia(id, b);
				return b;
			} catch {
				return null;
			}
		},
		async putMedia(id, blob) {
			await o.local.putMedia(id, blob);
			state = { ...state, unsentMedia: [...new Set([...state.unsentMedia, id])] };
			await saveState();
			void serial(sendMedia).catch(failed);
		},
		// The server keeps photos (other devices may still show an older version that uses them).
		deleteMedia: (id) => o.local.deleteMedia(id),
		listMedia: () => o.local.listMedia(),
		getExtra: (k) => o.local.getExtra(k),
		putExtra: (k, v) => o.local.putExtra(k, v)
	};

	return {
		store,
		get status() {
			return status;
		},
		/** Start up: returns the data to show (the shared tree, merged with this device's unsynced changes; or this
		 *  device's copy when offline). */
		async start(): Promise<Dataset> {
			state = (await o.local.getExtra<State>(STATE_KEY)) ?? { synced: null, unsentMedia: [] };
			const local = await o.local.load();
			appHas = normalise(local ?? empty());
			try {
				const latest = await serial(() => o.remote.pull());
				if (!latest) {
					// Nothing shared yet: this device's tree becomes the first version.
					state = { ...state, synced: { version: 0, data: empty() } };
					await serial(pushNow);
				} else if (!state.synced) {
					// First time on this device: take the shared tree; keep what was here aside.
					if (local?.people.length && !eq(normalise(local), latest.data)) await o.local.putExtra('before-sync', local);
					state = { ...state, synced: latest };
					await saveState();
					appHas = structuredClone(latest.data);
					await o.local.save(latest.data);
					setStatus('saved');
				} else {
					const merged = merge3(state.synced.data, appHas, latest.data).data;
					state = { ...state, synced: latest };
					await saveState();
					appHas = merged;
					await o.local.save(merged);
					await serial(pushNow);
				}
				void serial(sendMedia).catch(failed);
			} catch (e) {
				failed(e);
			}
			// A copy: the app edits what it's given (and the engine compares against its own).
			return structuredClone(appHas);
		},
		/** Check for others' changes now (e.g. every half minute, when the tab comes back, when back online). */
		sync: () => serial(pullNow).catch(failed),
		/** Wait for anything in progress (tests). */
		idle: () => queue
	};
}

export type Sync = ReturnType<typeof createSync>;

/** How the app applies `onData`: what it shows now may include edits made since it last saved (`appHad`), so
 *  merge those on top of `next`. */
export const applyIncoming = (next: Dataset, appHad: Dataset, current: Dataset): Dataset => merge3(appHad, current, next).data;
