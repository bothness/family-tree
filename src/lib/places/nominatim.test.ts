import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reset, parseResults, searchPlaces, searchUrl } from './nominatim.ts';

// Trimmed from a real Nominatim response for "Leeds".
const LEEDS = [
	{
		lat: '53.7974185', lon: '-1.5437941', name: 'Leeds', display_name: 'Leeds, West Yorkshire, England, United Kingdom',
		osm_type: 'relation', osm_id: 118362, addresstype: 'city', type: 'administrative',
		address: { city: 'Leeds', county: 'West Yorkshire', state: 'England', country: 'United Kingdom' },
		extratags: { wikidata: 'Q39121', population: '536280' }
	},
	{
		lat: '44.9', lon: '-79.1', display_name: 'Leeds, Leeds and the Thousand Islands, Ontario, Canada',
		osm_type: 'node', osm_id: 42, addresstype: 'village', address: { state: 'Ontario', country: 'Canada' }, extratags: null
	}
] as const;

describe('parseResults', () => {
	it('keeps the name, wider area, position, OSM id and Wikidata id', () => {
		const [a, b] = parseResults(structuredClone(LEEDS) as never);
		expect(a).toEqual({ name: 'Leeds', context: 'West Yorkshire, England, United Kingdom', type: 'city', lat: 53.7974185, lon: -1.5437941, osm: 'relation/118362', wikidata: 'Q39121' });
		expect(b).toEqual({ name: 'Leeds', context: 'Ontario, Canada', type: 'village', lat: 44.9, lon: -79.1, osm: 'node/42' });
	});
});

describe('searchPlaces', () => {
	beforeEach(() => {
		_reset();
		vi.useFakeTimers();
	});
	afterEach(() => vi.useRealTimers());
	const fake = () => vi.fn(async () => new Response(JSON.stringify(LEEDS), { status: 200 }));

	it('asks Nominatim for JSON with address details and extra tags', () => {
		const u = new URL(searchUrl('Leeds'));
		expect(u.origin + u.pathname).toBe('https://nominatim.openstreetmap.org/search');
		expect(Object.fromEntries(u.searchParams)).toMatchObject({ q: 'Leeds', format: 'jsonv2', addressdetails: '1', extratags: '1' });
	});

	it('caches results, so the same search is only sent once', async () => {
		const f = fake();
		await searchPlaces('Leeds', { fetch: f });
		await searchPlaces('leeds ', { fetch: f });
		expect(f).toHaveBeenCalledTimes(1);
	});

	it('spaces requests at least a second apart', async () => {
		const f = fake();
		await searchPlaces('Leeds', { fetch: f });
		const second = searchPlaces('Bradford', { fetch: f });
		await vi.advanceTimersByTimeAsync(500);
		expect(f).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(700);
		await second;
		expect(f).toHaveBeenCalledTimes(2);
	});

	it('can be cancelled while waiting its turn', async () => {
		const f = fake();
		await searchPlaces('Leeds', { fetch: f });
		const ac = new AbortController();
		const p = searchPlaces('York', { fetch: f, signal: ac.signal });
		ac.abort();
		await expect(p).rejects.toThrow(/Abort/);
		expect(f).toHaveBeenCalledTimes(1);
	});

	it("doesn't search for a single letter", async () => {
		const f = fake();
		expect(await searchPlaces('L', { fetch: f })).toEqual([]);
		expect(f).not.toHaveBeenCalled();
	});
});
