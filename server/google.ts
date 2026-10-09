// Checking a "Sign in with Google" ID token (F4), with our own code rather than a service in front.
// The token is a JWT signed by Google (RS256). It's accepted only if:
// - its signature checks out against one of Google's published keys (by key id)
// - it was issued by Google, for this app (our OAuth client id), and hasn't expired
// - the email address is verified
// https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

export const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Allowance for clocks being slightly out. */
const SKEW_S = 60;

export interface GoogleIdentity {
	email: string;
	name?: string;
}
export interface Jwks {
	keys: (JsonWebKey & { kid?: string })[];
}

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export class TokenError extends Error {}

/** Check a Google ID token; returns who it's for, or throws a TokenError saying why not. */
export async function verifyGoogleToken(token: string, clientId: string, keys: () => Promise<Jwks>, now = Date.now()): Promise<GoogleIdentity> {
	const parts = token.split('.');
	if (parts.length !== 3) throw new TokenError('not a token');
	let header: { alg?: string; kid?: string }, claims: Record<string, unknown>;
	try {
		header = b64urlJson(parts[0]);
		claims = b64urlJson(parts[1]);
	} catch {
		throw new TokenError('unreadable token');
	}
	if (header.alg !== 'RS256') throw new TokenError('unexpected algorithm');
	const jwk = (await keys()).keys.find((k) => k.kid === header.kid);
	if (!jwk) throw new TokenError('unknown signing key');
	const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
	const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
	if (!ok) throw new TokenError('bad signature');

	const t = now / 1000;
	if (!ISSUERS.has(String(claims.iss))) throw new TokenError('not issued by Google');
	const aud = claims.aud;
	if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId)))) throw new TokenError('meant for a different app');
	if (typeof claims.exp !== 'number' || claims.exp < t - SKEW_S) throw new TokenError('expired');
	if (typeof claims.iat === 'number' && claims.iat > t + SKEW_S) throw new TokenError('issued in the future');
	if (typeof claims.email !== 'string' || !claims.email) throw new TokenError('no email address');
	if (claims.email_verified !== true && claims.email_verified !== 'true') throw new TokenError('email address not verified');
	return { email: claims.email.toLowerCase(), ...(typeof claims.name === 'string' ? { name: claims.name } : {}) };
}

/** Google's keys, cached for as long as Google says (they rotate them now and then). */
let cached: { at: number; maxAge: number; jwks: Jwks } | null = null;
export async function googleKeys(): Promise<Jwks> {
	if (cached && Date.now() - cached.at < cached.maxAge * 1000) return cached.jwks;
	const r = await fetch(GOOGLE_CERTS);
	if (!r.ok) throw new Error(`Couldn't fetch Google's keys (${r.status})`);
	const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
	cached = { at: Date.now(), maxAge, jwks: await r.json() };
	return cached.jwks;
}
