// Starting the family edition (loaded only in a SYNC build): wrap the browser store in the sync engine, keep the
// app's data in step with the shared tree, and check for others' changes now and then.
import { app } from '../app.svelte.ts';
import type { Dataset } from '../model/types.ts';
import type { DataStore } from '../storage/index.ts';
import { applyIncoming, createSync, RemoteError } from './engine.ts';
import { httpRemote } from './http.ts';
import { patch } from './patch.ts';

/** How often to look for others' changes while the app is open. */
const POLL_MS = 30_000;

export async function startFamilySync(local: DataStore): Promise<{ store: DataStore; data: Dataset }> {
	const remote = httpRemote();
	try {
		app.user = await remote.me();
	} catch (e) {
		app.syncStatus = e instanceof RemoteError ? e.kind : 'offline';
	}
	const sync = createSync({
		local,
		remote,
		who: () => app.user?.email ?? 'unknown',
		onStatus: (s) => (app.syncStatus = s),
		onData: (next, had) => {
			// What's on screen may include edits not yet saved: keep them on top of the incoming changes, and update
			// the live data in place so open panels and fields aren't rebuilt.
			const current = JSON.parse(JSON.stringify(app.data)) as Dataset;
			app.replacing = true; // others' changes don't count towards this device's backup reminder
			patch(app.data as never, applyIncoming(next, had, current) as never);
		}
	});
	const data = await sync.start();
	const check = () => document.visibilityState === 'visible' && sync.sync();
	setInterval(check, POLL_MS);
	document.addEventListener('visibilitychange', check);
	addEventListener('online', () => sync.sync());
	return { store: sync.store, data };
}
