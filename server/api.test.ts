// The family edition's API against a real local D1 database and R2 bucket (wrangler's emulator; nothing reaches
// Cloudflare).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { handle, type Identify } from './api.ts';
import { cloudflareRepo, KEEP_RECENT, type Env } from './repo.ts';

let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let env: Env;
beforeAll(async () => {
	proxy = await getPlatformProxy<Env>({ persist: false });
	env = proxy.env;
}, 60_000);
afterAll(() => proxy?.dispose());

beforeEach(async () => {
	for (const t of ['tree_versions', 'users']) await env.DB.exec(`DROP TABLE IF EXISTS ${t}`);
	for (const o of (await env.BUCKET.list()).objects) await env.BUCKET.delete(o.key);
	const sql = readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
	for (const stmt of sql.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)) await env.DB.exec(stmt);
	const now = '2026-10-09T10:00:00Z';
	await env.DB.prepare("INSERT INTO users (email, role, added_at) VALUES ('owner@example.com', 'owner', ?), ('viewer@example.com', 'viewer', ?)").bind(now, now).run();
});

const as =
	(email: string | null): Identify =>
	async () =>
		email ? { email } : null;
const call = (path: string, init: RequestInit = {}, who: string | null = 'owner@example.com') =>
	handle(new Request(`http://localhost${path}`, init), cloudflareRepo(env), as(who));
const put = (base: number, data: unknown, who?: string) =>
	call('/api/tree', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base, data }) }, who);
const tree = (n: number) => ({ schemaVersion: '0.2', people: [{ id: `per_${n}` }], families: [], events: [], places: [], sources: [], views: [], media: [] });

describe('family edition API', () => {
	it('says who you are, refuses strangers and the signed-out', async () => {
		expect(await (await call('/api/me')).json()).toEqual({ email: 'owner@example.com', role: 'owner' });
		expect((await call('/api/me', {}, 'stranger@example.com')).status).toBe(403);
		expect((await call('/api/me', {}, null)).status).toBe(401);
	});

	it('starts empty, then keeps numbered versions', async () => {
		expect((await call('/api/tree')).status).toBe(204);
		expect(await (await put(0, tree(1))).json()).toEqual({ version: 1 });
		expect(await (await put(1, tree(2))).json()).toEqual({ version: 2 });
		const latest = await (await call('/api/tree')).json();
		expect(latest).toEqual({ version: 2, data: tree(2) });
	});

	it('refuses a save based on an old version, sending the newest back', async () => {
		await put(0, tree(1));
		await put(1, tree(2));
		const r = await put(1, tree(3));
		expect(r.status).toBe(409);
		expect(await r.json()).toEqual({ version: 2, data: tree(2) });
	});

	it('lets only one of two saves racing for the same version through', async () => {
		await put(0, tree(1));
		const results = await Promise.all([put(1, tree(2)), put(1, tree(3)), put(1, tree(4))]);
		expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
		const winner = (await (await call('/api/tree')).json()) as { version: number; data: unknown };
		expect(winner.version).toBe(2);
		// Only the winner's file is left in R2 (plus version 1's).
		expect((await env.BUCKET.list({ prefix: 'tree/' })).objects).toHaveLength(2);
	});

	it('records who saved each version', async () => {
		await put(0, tree(1));
		const row = await env.DB.prepare('SELECT saved_by, size FROM tree_versions WHERE version = 1').first<{ saved_by: string; size: number }>();
		expect(row?.saved_by).toBe('owner@example.com');
		expect(row?.size).toBeGreaterThan(10);
	});

	it('lets viewers read but not save', async () => {
		await put(0, tree(1));
		expect((await call('/api/tree', {}, 'viewer@example.com')).status).toBe(200);
		expect((await put(1, tree(2), 'viewer@example.com')).status).toBe(403);
	});

	it('checks what it is sent', async () => {
		expect((await put(0, { people: 'nope' })).status).toBe(400);
		expect((await put(-1, tree(1))).status).toBe(400);
		expect((await call('/api/tree', { method: 'PUT', body: 'not json' })).status).toBe(400);
	});

	it('stores and returns photos', async () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
		expect((await call('/api/media/media_1', { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg })).status).toBe(200);
		const r = await call('/api/media/media_1');
		expect(r.headers.get('content-type')).toBe('image/jpeg');
		expect(new Uint8Array(await r.arrayBuffer())).toEqual(jpeg);
		expect((await call('/api/media/missing')).status).toBe(404);
		expect((await call('/api/media/x', { method: 'PUT', headers: { 'content-type': 'text/html' }, body: 'hi' })).status).toBe(415);
		expect((await call('/api/media/..%2Fsecret')).status).toBe(400);
	});

	it(`keeps the last ${KEEP_RECENT} versions, and one a day before that`, async () => {
		// Pretend earlier versions were saved on two earlier days.
		const repo = cloudflareRepo(env, () => '2026-10-07T09:00:00Z');
		for (let v = 0; v < 3; v++) await repo.save(v, JSON.stringify(tree(v)), 'owner@example.com');
		const repo2 = cloudflareRepo(env, () => '2026-10-08T09:00:00Z');
		for (let v = 3; v < 6; v++) await repo2.save(v, JSON.stringify(tree(v)), 'owner@example.com');
		const repo3 = cloudflareRepo(env, () => '2026-10-09T09:00:00Z');
		for (let v = 6; v < KEEP_RECENT + 10; v++) await repo3.save(v, JSON.stringify(tree(v)), 'owner@example.com');
		const rows = (await env.DB.prepare('SELECT version FROM tree_versions ORDER BY version').all<{ version: number }>()).results.map((r) => r.version);
		// Days 7 and 8 keep their first version (1 and 4), today its first (7); and the last KEEP_RECENT in full.
		expect(rows.slice(0, 3)).toEqual([1, 4, 7]);
		expect(rows.length).toBe(3 + KEEP_RECENT);
		expect(rows.at(-1)).toBe(KEEP_RECENT + 10);
		expect((await env.BUCKET.list({ prefix: 'tree/' })).objects.length).toBe(rows.length);
	}, 60_000);
});
