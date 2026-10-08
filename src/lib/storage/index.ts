// Storage is behind one small interface so the backend (browser now; GitHub or Cloudflare later) can change
// without touching the rest of the app. See "Open questions" in docs/MODEL.md.
import type { Dataset } from '../model/types.ts';
import { migrate } from '../model/migrate.ts';

export interface DataStore {
	load(): Dataset | null;
	save(d: Dataset): void;
}

const KEY = 'family-tree:data';

/** Browser localStorage. Data stays on this device only. */
export const localStore: DataStore = {
	load() {
		try {
			const s = localStorage.getItem(KEY);
			return s ? migrate(JSON.parse(s)) : null;
		} catch {
			return null;
		}
	},
	save(d) {
		try {
			localStorage.setItem(KEY, JSON.stringify(d));
		} catch {
			/* storage full or unavailable: keep working in memory */
		}
	}
};
