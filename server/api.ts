// The family edition's API (Phase F3), used by src/lib/sync/http.ts:
//   GET  /api/me         → { email, name, role }            401 signed out, 403 not invited
//   GET  /api/tree       → { version, data } | 204 (nothing saved yet)
//   PUT  /api/tree       { base, data } → { version } | 409 { version, data } (someone saved first)
//   GET  /api/media/:id  → the photo | 404
//   PUT  /api/media/:id  the photo's bytes (an image, at most 10 MB)
// Viewers can read; owners and editors can save.
import type { Repo, User } from './repo.ts';

const MAX_TREE = 25 * 1024 * 1024,
	MAX_PHOTO = 10 * 1024 * 1024;
const MEDIA_ID = /^[A-Za-z0-9_-]{1,80}$/;

const json = (body: unknown, status = 200) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const error = (status: number, message: string) => json({ error: message }, status);

/** Who's asking: null if not signed in; a user with no role if signed in but not invited. */
export type Identify = (request: Request) => Promise<{ email: string } | null>;

export async function handle(request: Request, repo: Repo, identify: Identify): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, '');
	if (!path.startsWith('/api/')) return error(404, 'Not found');

	const who = await identify(request);
	if (!who) return error(401, 'Not signed in');
	const user: User | null = await repo.user(who.email);
	if (!user) return error(403, 'Not invited to this tree');
	const canEdit = user.role === 'owner' || user.role === 'editor';

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
			const o = await repo.getMedia(id);
			// Photos never change once stored under an id (a new photo gets a new id), so they can be cached.
			return o ? new Response(o.body, { headers: { 'content-type': o.type, 'cache-control': 'private, max-age=31536000, immutable' } }) : error(404, 'No such photo');
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
