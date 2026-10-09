// Storage is behind one small interface so the backend can change without touching the rest of the app.
// The browser store is first-class (a browser-only edition is planned, see docs/ROADMAP.md "Later"): any sync
// with a back end goes on top of it, never instead of it.
import type { Dataset } from '../model/types.ts';
import { migrate } from '../model/migrate.ts';
import { blobToDataUrl, dataUrlToBlob } from '../media/images.ts';

export interface DataStore {
	load(): Promise<Dataset | null>;
	save(d: Dataset): Promise<void>;
	/** Image files (photos), kept apart from the dataset and referred to by id. */
	getMedia(id: string): Promise<Blob | null>;
	putMedia(id: string, blob: Blob): Promise<void>;
	deleteMedia(id: string): Promise<void>;
	/** Ids of all stored image files. */
	listMedia(): Promise<string[]>;
}

/** Where data lived before IndexedDB. Read once to move data across; left in place as a fallback copy. */
export const LEGACY_KEY = 'family-tree:data';
const DB_NAME = 'family-tree',
	DB_VERSION = 1;

const req = <T>(r: IDBRequest<T>) =>
	new Promise<T>((ok, fail) => {
		r.onsuccess = () => ok(r.result);
		r.onerror = () => fail(r.error);
	});

function openDb(name = DB_NAME): Promise<IDBDatabase> {
	const r = indexedDB.open(name, DB_VERSION);
	r.onupgradeneeded = () => {
		const db = r.result;
		if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
		if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
	};
	return req(r);
}

/** Browser IndexedDB: room for photos, data stays on this device only. */
export function indexedDbStore(name = DB_NAME): DataStore {
	let db: Promise<IDBDatabase> | null = null;
	const tx = async (store: 'data' | 'media', mode: IDBTransactionMode) => (await (db ??= openDb(name))).transaction(store, mode).objectStore(store);
	return {
		async load() {
			const stored = await req((await tx('data', 'readonly')).get('current'));
			if (stored) return migrate(stored);
			// First run on IndexedDB: bring across anything saved by the older localStorage version.
			const legacy = readLegacy();
			if (legacy) await this.save(legacy);
			return legacy;
		},
		async save(d) {
			await req((await tx('data', 'readwrite')).put(d, 'current'));
		},
		// Images are stored as bytes plus type rather than as Blobs, which some browsers (older Safari) mishandle.
		async getMedia(id) {
			const m = (await req((await tx('media', 'readonly')).get(id))) as { type: string; bytes: ArrayBuffer } | undefined;
			return m ? new Blob([m.bytes], { type: m.type }) : null;
		},
		async putMedia(id, blob) {
			const bytes = await blob.arrayBuffer();
			await req((await tx('media', 'readwrite')).put({ type: blob.type, bytes }, id));
		},
		async deleteMedia(id) {
			await req((await tx('media', 'readwrite')).delete(id));
		},
		async listMedia() {
			return (await req((await tx('media', 'readonly')).getAllKeys())).map(String);
		}
	};
}

function readLegacy(): Dataset | null {
	try {
		const s = localStorage.getItem(LEGACY_KEY);
		return s ? migrate(JSON.parse(s)) : null;
	} catch {
		return null;
	}
}

/** Fallback where IndexedDB isn't available (some private-browsing modes): localStorage, no photos. */
export const localStore: DataStore = {
	async load() {
		return readLegacy();
	},
	async save(d) {
		try {
			localStorage.setItem(LEGACY_KEY, JSON.stringify(d));
		} catch {
			/* storage full or unavailable: keep working in memory */
		}
	},
	async getMedia() {
		return null;
	},
	async putMedia() {
		throw new Error('Photos need IndexedDB, which this browser has turned off.');
	},
	async deleteMedia() {},
	async listMedia() {
		return [];
	}
};

/** The store the app uses: IndexedDB when it works, else localStorage. */
export async function browserStore(): Promise<DataStore> {
	try {
		if (typeof indexedDB === 'undefined') return localStore;
		await openDb();
		return indexedDbStore();
	} catch {
		return localStore;
	}
}

// ---- backups ----
// A backup is the dataset as JSON plus `mediaFiles`: each stored photo as a data: URL, so one file holds
// everything (the browser-only edition relies on it). `mediaFiles` isn't part of the schema; it's taken off
// when a backup is loaded and the photos are put back in the store.

/** Make a backup file's text: the dataset plus its photo files. */
export async function makeBackup(store: DataStore, d: Dataset): Promise<string> {
	const mediaFiles: Record<string, string> = {};
	for (const m of d.media) {
		const b = await store.getMedia(m.id);
		if (b) mediaFiles[m.id] = await blobToDataUrl(b);
	}
	return JSON.stringify({ ...d, ...(Object.keys(mediaFiles).length ? { mediaFiles } : {}) }, null, 2);
}

/** Read a backup (or plain data): puts any photo files into the store and returns the dataset. */
export async function readBackup(store: DataStore, text: string): Promise<Dataset> {
	return readBackupData(store, JSON.parse(text));
}

/** Read parsed backup data. `mediaFiles` values are data: URLs (a JSON backup) or, in a ZIP export, paths that
 *  `file` turns into the photo. */
export async function readBackupData(store: DataStore, raw: any, file?: (path: string) => Promise<Blob | null>): Promise<Dataset> {
	if (!Array.isArray(raw?.people) || !Array.isArray(raw.families) || !Array.isArray(raw.events)) throw new Error('it needs people, families and events lists.');
	const files: Record<string, string> = raw.mediaFiles ?? {};
	delete raw.mediaFiles;
	for (const [id, ref] of Object.entries(files)) {
		const b = ref.startsWith('data:') ? await dataUrlToBlob(ref) : await file?.(ref);
		if (b) await store.putMedia(id, b);
	}
	return migrate(raw);
}

/** Delete stored photo files that the dataset no longer refers to. */
export async function pruneMedia(store: DataStore, d: Dataset) {
	const keep = new Set(d.media.map((m) => m.id));
	for (const id of await store.listMedia()) if (!keep.has(id)) await store.deleteMedia(id);
}
