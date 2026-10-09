// The family edition's server, over HTTP (the Worker in functions/api/, Phase F3). Same origin as the app, so the
// session cookie goes with every request.
//   GET  /api/me              → { email, name, role }            (401 signed out, 403 not invited)
//   GET  /api/tree            → { version, data } | 204 (nothing saved yet)
//   PUT  /api/tree            { base, data } → { version } | 409 { version, data } (someone saved first)
//   GET  /api/media/:id       → the photo | 404
//   PUT  /api/media/:id       the photo's bytes
import type { Dataset } from '../model/types.ts';
import { RemoteError, type Remote, type Snapshot } from './engine.ts';

export interface Me {
	email: string;
	name?: string;
	role: 'owner' | 'editor' | 'viewer';
}

async function call(path: string, init?: RequestInit): Promise<Response> {
	let r: Response;
	try {
		r = await fetch(path, { credentials: 'same-origin', ...init });
	} catch {
		throw new RemoteError('offline');
	}
	if (r.status === 401) throw new RemoteError('signed-out');
	if (r.status === 403) throw new RemoteError('forbidden');
	if (r.status >= 500) throw new RemoteError('offline', `server error ${r.status}`);
	return r;
}

export function httpRemote(base = '/api'): Remote & { me(): Promise<Me> } {
	return {
		async me() {
			return (await call(`${base}/me`)).json();
		},
		async pull() {
			const r = await call(`${base}/tree`);
			return r.status === 204 ? null : ((await r.json()) as Snapshot);
		},
		async push(baseVersion: number, data: Dataset) {
			const r = await call(`${base}/tree`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base: baseVersion, data }) });
			if (r.status === 409) return { ok: false, latest: (await r.json()) as Snapshot };
			if (!r.ok) throw new Error(`Saving failed (${r.status})`);
			return { ok: true, version: ((await r.json()) as { version: number }).version };
		},
		async getMedia(id) {
			const r = await call(`${base}/media/${encodeURIComponent(id)}`);
			return r.ok ? r.blob() : null;
		},
		async putMedia(id, blob) {
			const r = await call(`${base}/media/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
			if (!r.ok) throw new Error(`Uploading a photo failed (${r.status})`);
		}
	};
}
