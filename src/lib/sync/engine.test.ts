import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import demo from '../data/demo-darwin.json';
import example from '../data/example-data.json';
import type { Dataset } from '../model/types.ts';
import type { DataStore } from '../storage/index.ts';
import { person } from '../model/queries.ts';
import { newPerson, setLife } from '../model/mutations.ts';
import { applyIncoming, createSync, RemoteError, type Remote, type Snapshot, type SyncStatus } from './engine.ts';
import { eq, normalise } from './merge.ts';

/** The server: numbered versions, saves refused unless based on the newest; can be "offline". */
function fakeServer() {
	const versions: Snapshot[] = [];
	const media = new Map<string, Blob>();
	let offline = false;
	const up = () => {
		if (offline) throw new RemoteError('offline');
	};
	const remote: Remote = {
		async pull() {
			up();
			return versions.length ? structuredClone(versions.at(-1)!) : null;
		},
		async push(base, data) {
			up();
			const v = versions.at(-1)?.version ?? 0;
			if (base !== v) return { ok: false, latest: structuredClone(versions.at(-1)!) };
			versions.push({ version: v + 1, data: structuredClone(data) });
			return { ok: true, version: v + 1 };
		},
		async getMedia(id) {
			up();
			return media.get(id) ?? null;
		},
		async putMedia(id, b) {
			up();
			media.set(id, b);
		}
	};
	return {
		remote,
		versions,
		media,
		latest: () => versions.at(-1)?.data,
		setOffline: (v: boolean) => (offline = v)
	};
}

/** A device's own browser store, in memory. */
function memoryStore(initial: Dataset | null = null): DataStore & { data: Dataset | null; extras: Map<string, unknown> } {
	const media = new Map<string, Blob>();
	const extras = new Map<string, unknown>();
	return {
		data: initial && structuredClone(initial),
		extras,
		async load() {
			return this.data && structuredClone(this.data);
		},
		async save(d) {
			this.data = structuredClone(d);
		},
		async getMedia(id) {
			return media.get(id) ?? null;
		},
		async putMedia(id, b) {
			media.set(id, b);
		},
		async deleteMedia(id) {
			media.delete(id);
		},
		async listMedia() {
			return [...media.keys()];
		},
		async getExtra<T>(k: string) {
			return (extras.get(k) as T) ?? null;
		},
		async putExtra(k, v) {
			extras.set(k, structuredClone(v));
		}
	};
}

/** A device: its store, the sync engine, and "the app" (its live data), wired as the app does it. */
async function device(server: ReturnType<typeof fakeServer>, who: string, local: Dataset | null = null) {
	const store = memoryStore(local);
	const statuses: SyncStatus[] = [];
	const app = { data: null as unknown as Dataset };
	const sync = createSync({
		local: store,
		remote: server.remote,
		who: () => who,
		onData: (next, had) => (app.data = applyIncoming(next, had, app.data)),
		onStatus: (s) => statuses.push(s)
	});
	app.data = await sync.start();
	await sync.idle();
	/** Edit the app's data and save it, as the app does after each change. */
	const edit = async (f: (d: Dataset) => void) => {
		f(app.data);
		await sync.store.save(app.data);
		await sync.idle();
	};
	return { store, sync, app, edit, statuses };
}

const DARWINS = normalise(demo);
const p = (d: Dataset, id: string) => person(d, id)!;
let clock = 0;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
	clock = 0;
});
afterEach(() => vi.useRealTimers());
/** Move the clock on a minute (so edits get different times). */
const later = () => vi.setSystemTime(new Date(Date.parse('2026-10-09T10:00:00Z') + ++clock * 60_000));

describe('sync engine', () => {
	it('the first device to sync makes its tree the first shared version', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		expect(server.versions.map((v) => v.version)).toEqual([1]);
		expect(server.latest()!.people).toHaveLength(DARWINS.people.length);
		expect(a.sync.status).toBe('saved');
	});

	it('a new device takes the shared tree, keeping what it had aside', async () => {
		const server = fakeServer();
		await device(server, 'owner@example.com', DARWINS);
		const b = await device(server, 'cousin@example.com', normalise(example));
		expect(eq(b.app.data, server.latest())).toBe(true);
		expect((b.store.extras.get('before-sync') as Dataset).people.some((x) => x.id === 'per_john_smith')).toBe(true);
		expect(server.versions).toHaveLength(1); // nothing of the Smiths was sent
	});

	it("passes one device's edits to the other, stamped with who and when", async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		const b = await device(server, 'cousin@example.com');
		later();
		await a.edit((d) => (p(d, 'per_annie').notes = 'Died at Malvern'));
		expect(p(server.latest()!, 'per_annie')).toMatchObject({ notes: 'Died at Malvern', meta: { updatedBy: 'owner@example.com' } });
		await b.sync.sync();
		expect(p(b.app.data, 'per_annie').notes).toBe('Died at Malvern');
	});

	it('merges when both devices saved: different people', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		const b = await device(server, 'cousin@example.com');
		await a.edit((d) => (p(d, 'per_annie').notes = 'from A'));
		await b.edit((d) => (p(d, 'per_george').notes = 'from B')); // refused (A saved first), merged, saved again
		await a.sync.sync();
		for (const d of [a.app.data, b.app.data, server.latest()!]) {
			expect(p(d, 'per_annie').notes).toBe('from A');
			expect(p(d, 'per_george').notes).toBe('from B');
		}
		// Both devices show the same tree (the app's own copy needn't carry the edit stamps; the engine keeps them).
		expect(diff(unstamped(a.app.data), unstamped(b.app.data))).toEqual([]);
	});

	it('the same field edited on both: the later edit wins, everywhere', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		const b = await device(server, 'cousin@example.com');
		server.setOffline(true);
		later();
		await b.edit((d) => setLife(d, 'per_annie', 'birth', '1840', null)); // B first, offline
		later();
		server.setOffline(false);
		await a.edit((d) => setLife(d, 'per_annie', 'birth', '1841', null)); // A later, saved at once
		await b.sync.sync(); // B comes back online: its older edit loses
		await a.sync.sync();
		const birth = (d: Dataset) => d.events.find((e) => e.id === 'evt_birth_annie')!.date!.edtf;
		expect([birth(a.app.data), birth(b.app.data), birth(server.latest()!)]).toEqual(['1841', '1841', '1841']);
	});

	it('works offline and catches up when back', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		server.setOffline(true);
		await a.edit((d) => newPerson(d, 'Offline Person'));
		expect(a.sync.status).toBe('offline');
		expect(a.store.data!.people.some((x) => x.names?.[0]?.given === 'Offline')).toBe(true);
		server.setOffline(false);
		await a.sync.sync();
		expect(a.sync.status).toBe('saved');
		expect(server.latest()!.people.some((x) => x.names?.[0]?.given === 'Offline')).toBe(true);
	});

	it('keeps edits made on screen while changes arrive', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		const b = await device(server, 'cousin@example.com');
		await a.edit((d) => (p(d, 'per_annie').notes = 'from A'));
		p(b.app.data, 'per_george').notes = 'typed on B, not saved yet';
		await b.sync.sync();
		expect(p(b.app.data, 'per_annie').notes).toBe('from A');
		expect(p(b.app.data, 'per_george').notes).toBe('typed on B, not saved yet');
	});

	it('starts offline from this device’s copy', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		await a.edit((d) => (p(d, 'per_annie').notes = 'x'));
		server.setOffline(true);
		const again = createSync({ local: a.store, remote: server.remote, who: () => 'owner@example.com', onData: () => {} });
		const d = await again.start();
		expect(p(d, 'per_annie').notes).toBe('x');
		expect(again.status).toBe('offline');
	});

	it('sends photos, and fetches ones a device lacks', async () => {
		const server = fakeServer();
		const a = await device(server, 'owner@example.com', DARWINS);
		const b = await device(server, 'cousin@example.com');
		server.setOffline(true);
		await a.sync.store.putMedia('media_1', new Blob(['jpeg'], { type: 'image/jpeg' }));
		await a.sync.idle();
		expect(server.media.has('media_1')).toBe(false); // offline: waits
		server.setOffline(false);
		await a.sync.sync();
		expect(server.media.has('media_1')).toBe(true);
		expect(await (await b.sync.store.getMedia('media_1'))!.text()).toBe('jpeg');
		expect(await b.store.getMedia('media_1')).not.toBeNull(); // kept on B now
	});

	it('reports being signed out or not invited', async () => {
		const server = fakeServer();
		const remote = { ...server.remote, pull: async () => Promise.reject(new RemoteError('forbidden')) };
		const s = createSync({ local: memoryStore(), remote, who: () => 'x', onData: () => {} });
		await s.start();
		expect(s.status).toBe('forbidden');
	});
});

/** The data without edit stamps. */
const unstamped = (d: Dataset) => JSON.parse(JSON.stringify(d, (k, v) => (k === 'meta' ? undefined : v)));

/** Where two datasets differ (paths), for readable failures. */
function diff(x: unknown, y: unknown, path = ''): string[] {
	if (eq(x, y)) return [];
	if (typeof x !== 'object' || typeof y !== 'object' || !x || !y) return [`${path}: ${JSON.stringify(x)?.slice(0, 80)} ≠ ${JSON.stringify(y)?.slice(0, 80)}`];
	const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
	return [...keys].flatMap((k) => diff((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${path}/${k}`));
}
