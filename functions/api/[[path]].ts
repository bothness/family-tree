// Cloudflare Pages Function: every /api/* request goes to the family edition's API (server/api.ts).
import { handle } from '../../server/api.ts';
import { identify } from '../../server/auth.ts';
import { cloudflareRepo, type Env } from '../../server/repo.ts';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
	const repo = cloudflareRepo(env);
	// Local development: the stand-in user (DEV_USER in .dev.vars) is the owner. F4 adds the invite list proper.
	const host = new URL(request.url).hostname;
	if (env.DEV_USER && (host === 'localhost' || host === '127.0.0.1'))
		await env.DB.prepare("INSERT OR IGNORE INTO users (email, role, added_at) VALUES (?, 'owner', ?)").bind(env.DEV_USER.toLowerCase(), new Date().toISOString()).run();
	return handle(request, repo, identify(env));
};
