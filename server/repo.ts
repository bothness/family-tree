// Where the family edition's data lives on Cloudflare: D1 (the list of tree versions, the invite list) and R2 (each
// version's data, and photos). Behind a small interface so the API can be tested without Cloudflare.

export interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	/** Local development only (honoured only on localhost): act as this signed-in owner. */
	DEV_USER?: string;
	/** The first owner, who can then invite others (F4). */
	OWNER_EMAIL?: string;
}

export type Role = 'owner' | 'editor' | 'viewer';
export interface User {
	email: string;
	role: Role;
	name?: string;
}
export interface VersionInfo {
	version: number;
	savedAt: string;
	savedBy: string;
}

export interface Repo {
	latest(): Promise<VersionInfo | null>;
	/** A version's data, as the JSON text the app sent. */
	read(version: number): Promise<string | null>;
	/** Save `json` as version base + 1, unless that's taken (someone else saved first). */
	save(base: number, json: string, by: string): Promise<{ ok: true; version: number } | { ok: false }>;
	getMedia(id: string): Promise<{ body: ReadableStream | ArrayBuffer; type: string } | null>;
	putMedia(id: string, body: ArrayBuffer, type: string): Promise<void>;
	user(email: string): Promise<User | null>;
}

/** How many recent versions to keep in full; older ones are thinned to one a day. */
export const KEEP_RECENT = 200;

export function cloudflareRepo(env: Env, now = () => new Date().toISOString()): Repo {
	const db = env.DB,
		bucket = env.BUCKET;
	return {
		async latest() {
			const r = await db.prepare('SELECT version, saved_at, saved_by FROM tree_versions ORDER BY version DESC LIMIT 1').first<{ version: number; saved_at: string; saved_by: string }>();
			return r ? { version: r.version, savedAt: r.saved_at, savedBy: r.saved_by } : null;
		},
		async read(version) {
			const r = await db.prepare('SELECT key FROM tree_versions WHERE version = ?').bind(version).first<{ key: string }>();
			const o = r && (await bucket.get(r.key));
			return o ? o.text() : null;
		},
		async save(base, json, by) {
			const latest = (await this.latest())?.version ?? 0;
			if (latest !== base) return { ok: false };
			const version = base + 1;
			// A key of its own, so two saves racing for the same number can't overwrite each other's file.
			const key = `tree/${String(version).padStart(8, '0')}-${crypto.randomUUID()}.json`;
			await bucket.put(key, json, { httpMetadata: { contentType: 'application/json' } });
			try {
				await db.prepare('INSERT INTO tree_versions (version, key, saved_at, saved_by, size) VALUES (?, ?, ?, ?, ?)').bind(version, key, now(), by, json.length).run();
			} catch {
				// The number was taken in the meantime: someone else saved first.
				await bucket.delete(key);
				return { ok: false };
			}
			await thin(version);
			return { ok: true, version };
		},
		async getMedia(id) {
			const o = await bucket.get(`media/${id}`);
			return o ? { body: o.body, type: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null;
		},
		async putMedia(id, body, type) {
			await bucket.put(`media/${id}`, body, { httpMetadata: { contentType: type } });
		},
		async user(email) {
			const r = await db.prepare('SELECT email, role, name FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ email: string; role: Role; name: string | null }>();
			return r ? { email: r.email, role: r.role, ...(r.name ? { name: r.name } : {}) } : null;
		}
	};

	/** Keep the last KEEP_RECENT versions, and one a day (the first) before that. */
	async function thin(latest: number) {
		const old = await db
			.prepare(
				`SELECT version, key FROM tree_versions WHERE version <= ? AND version NOT IN (SELECT MIN(version) FROM tree_versions GROUP BY substr(saved_at, 1, 10))`
			)
			.bind(latest - KEEP_RECENT)
			.all<{ version: number; key: string }>();
		for (const r of old.results) {
			await bucket.delete(r.key);
			await db.prepare('DELETE FROM tree_versions WHERE version = ?').bind(r.version).run();
		}
	}
}
