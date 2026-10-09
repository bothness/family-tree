// The family edition's API (Phase F3, F4), used by src/lib/sync/http.ts and the sign-in screen:
//   GET    /api/config          → { googleClientId }                          (no sign-in needed)
//   POST   /api/session         { credential } (a Google ID token) → me, and a session cookie; 403 if not invited
//   DELETE /api/session         sign out (this device)
//   GET    /api/me              → { email, name, role }                      401 signed out, 403 not invited
//   GET    /api/tree            → { version, data } | 204 (nothing saved yet)
//   PUT    /api/tree            { base, data } → { version } | 409 { version, data } (someone saved first)
//   GET    /api/media/:id       → the photo | 404
//   PUT    /api/media/:id       the photo's bytes (an image, at most 10 MB)
//   GET    /api/users           → the invite list                            (owners only)
//   PUT    /api/users/:email    { role, name? } → invite, or change a role   (owners only)
//   DELETE /api/users/:email    remove (and sign out) someone                (owners only)
// Viewers can read; owners and editors can save. The invite list is checked on every request, so removing
// someone locks them out at once.
import type { GoogleIdentity } from './google.ts';
import type { Repo, Role, User } from './repo.ts';
import { SESSION_DAYS, hashToken, isLocal, newToken, readSessionToken, sessionCookie } from './session.ts';

const MAX_TREE = 25 * 1024 * 1024,
	MAX_PHOTO = 10 * 1024 * 1024;
const MEDIA_ID = /^[A-Za-z0-9_-]{1,80}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<Role>(['owner', 'editor', 'viewer']);

export interface ApiOptions {
	/** Check a Google ID token (google.ts), returning whose it is. */
	verify: (credential: string) => Promise<GoogleIdentity>;
	googleClientId?: string;
	/** The first owner: let in (as owner) even before there's an invite list. */
	ownerEmail?: string;
	/** Local development only (and only for requests to localhost): act as this person, signed in. */
	devUser?: string;
	now?: () => Date;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const error = (status: number, message: string, extra: Record<string, unknown> = {}) => json({ error: message, ...extra }, status);
const isJson = (r: Request) => (r.headers.get('content-type') ?? '').startsWith('application/json');

export async function handle(request: Request, repo: Repo, o: ApiOptions): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, '');
	const now = o.now?.() ?? new Date();
	if (!path.startsWith('/api/')) return error(404, 'Not found');

	/** The invited user with this email, adding the first owner if it's them. */
	const userFor = async (email: string): Promise<User | null> => {
		const u = await repo.user(email);
		if (u) return u;
		if (o.ownerEmail && email.toLowerCase() === o.ownerEmail.toLowerCase()) {
			await repo.putUser({ email, role: 'owner' }, 'OWNER_EMAIL');
			return repo.user(email);
		}
		return null;
	};

	// ---- no sign-in needed ----
	if (path === '/api/config' && request.method === 'GET') return json({ googleClientId: o.googleClientId ?? null });
	if (path === '/api/session') {
		if (request.method === 'POST') {
			if (!isJson(request)) return error(415, 'JSON only');
			let credential: unknown;
			try {
				credential = ((await request.json()) as { credential?: unknown }).credential;
			} catch {
				return error(400, 'Not JSON');
			}
			if (typeof credential !== 'string') return error(400, 'credential missing');
			let who: GoogleIdentity;
			try {
				who = await o.verify(credential);
			} catch (e) {
				return error(401, `Sign-in failed: ${(e as Error).message}`);
			}
			const user = await userFor(who.email);
			if (!user) return error(403, 'Not invited to this tree', { email: who.email });
			if (!user.name && who.name) await repo.putUser({ ...user, name: who.name }, user.email);
			const token = newToken();
			const expires = new Date(now.getTime() + SESSION_DAYS * 86400e3).toISOString();
			await repo.createSession(user.email, await hashToken(token), expires);
			return json({ ...user, ...(user.name || !who.name ? {} : { name: who.name }) }, 200, { 'set-cookie': sessionCookie(request, token) });
		}
		if (request.method === 'DELETE') {
			const token = readSessionToken(request);
			if (token) await repo.deleteSession(await hashToken(token));
			return new Response(null, { status: 204, headers: { 'set-cookie': sessionCookie(request, null), 'cache-control': 'no-store' } });
		}
		return error(405, 'Method not allowed');
	}

	// ---- signed in ----
	let email: string | null = null;
	if (o.devUser && isLocal(request)) email = o.devUser;
	else {
		const token = readSessionToken(request);
		if (token) email = await repo.sessionEmail(await hashToken(token), now.toISOString());
	}
	if (!email) return error(401, 'Not signed in');
	const user = await userFor(email);
	if (!user) return error(403, 'Not invited to this tree', { email });
	const canEdit = user.role === 'owner' || user.role === 'editor';
	// Writes must be JSON or a photo (never a plain form another site could submit).
	if (request.method !== 'GET' && !isJson(request) && !path.startsWith('/api/media/')) return error(415, 'JSON only');

	if (path === '/api/me' && request.method === 'GET') return json(user);

	if (path === '/api/tree') {
		if (request.method === 'GET') return latestTree(repo);
		if (request.method === 'PUT') {
			if (!canEdit) return error(403, 'View only');
			if (Number(request.headers.get('content-length') ?? 0) > MAX_TREE) return error(413, 'Too big');
			let body: { base?: unknown; data?: unknown };
			try {
				body = await request.json();
			} catch {
				return error(400, 'Not JSON');
			}
			const { base, data } = body;
			if (!Number.isInteger(base) || (base as number) < 0) return error(400, 'base must be a version number');
			if (!isDataset(data)) return error(400, 'data must be a family tree (people, families and events lists)');
			const text = JSON.stringify(data);
			if (text.length > MAX_TREE) return error(413, 'Too big');
			const r = await repo.save(base as number, text, user.email);
			if (r.ok) return json({ version: r.version });
			const latest = await latestTree(repo);
			return new Response(latest.body, { status: 409, headers: latest.headers });
		}
		return error(405, 'Method not allowed');
	}

	const m = path.match(/^\/api\/media\/([^/]+)$/);
	if (m) {
		const id = decodeURIComponent(m[1]);
		if (!MEDIA_ID.test(id)) return error(400, 'Bad photo id');
		if (request.method === 'GET') {
			const f = await repo.getMedia(id);
			// Photos never change once stored under an id (a new photo gets a new id), so they can be cached.
			return f ? new Response(f.body, { headers: { 'content-type': f.type, 'cache-control': 'private, max-age=31536000, immutable' } }) : error(404, 'No such photo');
		}
		if (request.method === 'PUT') {
			if (!canEdit) return error(403, 'View only');
			const type = request.headers.get('content-type') ?? '';
			if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return error(415, 'Photos only');
			const body = await request.arrayBuffer();
			if (body.byteLength > MAX_PHOTO) return error(413, 'Too big');
			await repo.putMedia(id, body, type);
			return json({ ok: true });
		}
		return error(405, 'Method not allowed');
	}

	// ---- the invite list (owners only) ----
	if (path === '/api/users' || path.startsWith('/api/users/')) {
		if (user.role !== 'owner') return error(403, 'Only owners can manage who has access');
		if (path === '/api/users') return request.method === 'GET' ? json(await repo.users()) : error(405, 'Method not allowed');
		const target = decodeURIComponent(path.slice('/api/users/'.length)).toLowerCase();
		if (!EMAIL.test(target)) return error(400, 'Not an email address');
		const owners = (await repo.users()).filter((u) => u.role === 'owner');
		const lastOwner = owners.length === 1 && owners[0].email === target;
		if (request.method === 'PUT') {
			let body: { role?: unknown; name?: unknown };
			try {
				body = await request.json();
			} catch {
				return error(400, 'Not JSON');
			}
			if (!ROLES.has(body.role as Role)) return error(400, 'role must be owner, editor or viewer');
			if (lastOwner && body.role !== 'owner') return error(409, 'The tree needs at least one owner');
			await repo.putUser({ email: target, role: body.role as Role, ...(typeof body.name === 'string' && body.name ? { name: body.name.slice(0, 100) } : {}) }, user.email);
			return json(await repo.user(target));
		}
		if (request.method === 'DELETE') {
			if (lastOwner) return error(409, 'The tree needs at least one owner');
			await repo.deleteUser(target);
			return new Response(null, { status: 204 });
		}
		return error(405, 'Method not allowed');
	}
	return error(404, 'Not found');
}

async function latestTree(repo: Repo): Promise<Response> {
	const v = await repo.latest();
	if (!v) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
	const text = await repo.read(v.version);
	if (text === null) return error(500, 'The latest version is missing');
	// The data is passed through as stored (no need to parse it here).
	return json(`{"version":${v.version},"data":${text}}`);
}

const isDataset = (d: unknown): boolean => {
	if (typeof d !== 'object' || d === null) return false;
	const x = d as Record<string, unknown>;
	return Array.isArray(x.people) && Array.isArray(x.families) && Array.isArray(x.events);
};
