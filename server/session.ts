// Session cookies (F4): a random token, sent as an HttpOnly cookie; the server keeps only its SHA-256.
// SameSite=Lax means the cookie never goes with another site's requests to our API (only with top-level page
// visits, which the API doesn't serve), and the API only accepts JSON writes, so other sites can't act as you.

/** How long a sign-in lasts. */
export const SESSION_DAYS = 30;

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export async function hashToken(token: string): Promise<string> {
	const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
	return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
export const isLocal = (request: Request) => LOCAL.has(new URL(request.url).hostname);

/** The cookie's name: `__Host-` (which browsers only accept over HTTPS, for this exact site) except in local
 *  development over plain http. */
const cookieName = (request: Request) => (isLocal(request) ? 'ft_session' : '__Host-ft_session');

export function readSessionToken(request: Request): string | null {
	const name = cookieName(request);
	for (const part of (request.headers.get('cookie') ?? '').split(';')) {
		const [k, ...v] = part.trim().split('=');
		if (k === name) return v.join('=') || null;
	}
	return null;
}

export function sessionCookie(request: Request, token: string | null): string {
	const secure = isLocal(request) ? '' : '; Secure';
	const life = token ? `; Max-Age=${SESSION_DAYS * 86400}` : '; Max-Age=0';
	return `${cookieName(request)}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax${secure}${life}`;
}
