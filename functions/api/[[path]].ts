// Cloudflare Pages Function: every /api/* request goes to the family edition's API (server/api.ts).
import { handle } from '../../server/api.ts';
import { googleKeys, verifyGoogleToken } from '../../server/google.ts';
import { cloudflareRepo, type Env } from '../../server/repo.ts';

export const onRequest: PagesFunction<Env> = ({ request, env }) =>
	handle(request, cloudflareRepo(env), {
		verify: (credential) => {
			if (!env.GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not set up (GOOGLE_CLIENT_ID)');
			return verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID, googleKeys);
		},
		googleClientId: env.GOOGLE_CLIENT_ID,
		ownerEmail: env.OWNER_EMAIL,
		devUser: env.DEV_USER
	});
