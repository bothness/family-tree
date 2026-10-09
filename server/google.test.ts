import { beforeAll, describe, expect, it } from 'vitest';
import { TokenError, verifyGoogleToken, type Jwks } from './google.ts';

// A stand-in for Google: our own RSA key, publishing its public half the way Google does.
const CLIENT = 'test-client.apps.googleusercontent.com';
let keys: CryptoKeyPair;
let jwks: Jwks;
const NOW = Date.parse('2026-10-09T12:00:00Z');
const enc = (v: unknown) => btoa(typeof v === 'string' ? v : JSON.stringify(v)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function token(claims: Record<string, unknown>, opts: { kid?: string; key?: CryptoKey; alg?: string } = {}) {
	const head = enc({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
	const body = enc({ iss: 'https://accounts.google.com', aud: CLIENT, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3600, email: 'Owner@Example.com', email_verified: true, name: 'Owner', ...claims });
	const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
	return `${head}.${body}.${enc(String.fromCharCode(...new Uint8Array(sig)))}`;
}
const verify = (t: string) => verifyGoogleToken(t, CLIENT, async () => jwks, NOW);

beforeAll(async () => {
	keys = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
	jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' }] };
});

describe('verifyGoogleToken', () => {
	it('accepts a good token, giving the email address (lower case) and name', async () => {
		expect(await verify(await token({}))).toEqual({ email: 'owner@example.com', name: 'Owner' });
	});

	it.each([
		['meant for another app', { aud: 'someone-else.apps.googleusercontent.com' }, /different app/],
		['not issued by Google', { iss: 'https://evil.example' }, /not issued by Google/],
		['expired', { exp: NOW / 1000 - 3600 }, /expired/],
		['from the future', { iat: NOW / 1000 + 3600 }, /future/],
		['an unverified email address', { email_verified: false }, /not verified/],
		['no email address', { email: undefined }, /no email/]
	])('refuses a token %s', async (_, claims, why) => {
		await expect(verify(await token(claims))).rejects.toThrow(why);
	});

	it('refuses a token signed by someone else, or with an unknown key or algorithm', async () => {
		const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign'])) as CryptoKeyPair;
		await expect(verify(await token({}, { key: other.privateKey }))).rejects.toThrow(/bad signature/);
		await expect(verify(await token({}, { kid: 'k9' }))).rejects.toThrow(/unknown signing key/);
		await expect(verify(await token({}, { alg: 'none' }))).rejects.toThrow(/algorithm/);
	});

	it('refuses a tampered token', async () => {
		const [h, , s] = (await token({})).split('.');
		const forged = `${h}.${enc({ iss: 'https://accounts.google.com', aud: CLIENT, exp: NOW / 1000 + 3600, email: 'intruder@example.com', email_verified: true })}.${s}`;
		await expect(verify(forged)).rejects.toThrow(TokenError);
		await expect(verify('not-a-token')).rejects.toThrow(TokenError);
	});
});
