// The family edition's server, over HTTP (the Worker in functions/api/, Phase F3). Same origin as the app, so the
// session cookie goes with every request.
//   GET  /api/config          → { googleClientId }
//   POST /api/session         { credential } → me (and a session cookie) | 403 { email } (not invited)
//   DELETE /api/session       sign out
//   GET  /api/me              → { email, name, role }            (401 signed out, 403 not invited)
//   GET/PUT/DELETE /api/users[/:email]   the invite list (owners)
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
	if (r.status === 403) {
		const body = (await r.clone().json().catch(() => ({}))) as { email?: string; error?: string };
		// A viewer trying to save is "view only", not "not invited".
		if (!body.email) return r;
		throw new RemoteError('forbidden', body.error, body.email);
	}
	if (r.status >= 500) throw new RemoteError('offline', `server error ${r.status}`);
	return r;
}

export interface Invite {
	email: string;
	role: Me['role'];
	name?: string;
	invitedBy?: string;
	addedAt: string;
}

const jsonBody = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Sign-in and the invite list (the family edition's account side). */
export const account = {
	async config(): Promise<{ googleClientId: string | null }> {
		return (await call('/api/config')).json();
	},
	/** Sign in with a Google ID token. Resolves to who you are, or { notInvited: email }. */
	async signIn(credential: string): Promise<Me | { notInvited: string }> {
		let r: Response;
		try {
			r = await fetch('/api/session', jsonBody('POST', { credential }));
		} catch {
			throw new RemoteError('offline');
		}
		if (r.status === 403) return { notInvited: ((await r.json()) as { email: string }).email };
		if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Sign-in failed (${r.status})`);
		return r.json();
	},
	async signOut() {
		await fetch('/api/session', jsonBody('DELETE')).catch(() => {});
	},
	async users(): Promise<Invite[]> {
		return (await call('/api/users')).json();
	},
	async invite(email: string, role: Me['role'], name?: string): Promise<void> {
		const r = await call(`/api/users/${encodeURIComponent(email)}`, jsonBody('PUT', { role, ...(name ? { name } : {}) }));
		if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't save (${r.status})`);
	},
	async remove(email: string): Promise<void> {
		const r = await call(`/api/users/${encodeURIComponent(email)}`, jsonBody('DELETE'));
		if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't remove (${r.status})`);
	}
};

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
