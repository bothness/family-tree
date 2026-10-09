// Who's making a request. F3: a stand-in for local development; F4 replaces it with Google sign-in.
import type { Env } from './repo.ts';
import type { Identify } from './api.ts';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

export function identify(env: Env): Identify {
	return async (request) => {
		// Local development only: DEV_USER (in .dev.vars) acts as the signed-in owner. Never honoured elsewhere.
		const host = new URL(request.url).hostname;
		if (env.DEV_USER && LOCAL.has(host)) return { email: env.DEV_USER };
		return null;
	};
}
