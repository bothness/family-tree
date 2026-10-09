// Place lookup with Nominatim (OpenStreetMap's search), called straight from the browser so it also works in the
// planned browser-only edition. Nominatim's usage policy allows this at low volume: at most one request a second,
// no autocomplete-on-every-keystroke (callers wait for a pause in typing), results cached, OSM credited.
// https://operations.osmfoundation.org/policies/nominatim/

export interface PlaceHit {
	/** Short name, e.g. "Leeds". */
	name: string;
	/** Wider area, e.g. "West Yorkshire, England". */
	context: string;
	/** OSM's kind of place, e.g. "city", "village", "suburb". */
	type: string;
	lat: number;
	lon: number;
	/** e.g. "relation/118362". */
	osm: string;
	/** Wikidata id from OSM's tags, if it has one, e.g. "Q39121". */
	wikidata?: string;
}

export const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
export const ATTRIBUTION = '© OpenStreetMap contributors';
const MIN_GAP_MS = 1100;

interface NominatimResult {
	lat: string;
	lon: string;
	name?: string;
	display_name: string;
	osm_type: 'node' | 'way' | 'relation';
	osm_id: number;
	addresstype?: string;
	type?: string;
	address?: Record<string, string>;
	extratags?: Record<string, string> | null;
}

/** Turn Nominatim's results into PlaceHits (pure, so it can be tested without the network). */
export function parseResults(rs: NominatimResult[]): PlaceHit[] {
	return rs.map((r) => {
		const name = r.name || r.display_name.split(',')[0].trim();
		const a = r.address ?? {};
		// The wider area: county (or similar), region, country, leaving out anything that repeats the name.
		const parts = [a.county ?? a.state_district ?? a.city ?? a.town, a.state, a.country].filter((x): x is string => !!x && x !== name);
		const wikidata = r.extratags?.wikidata;
		return {
			name,
			context: [...new Set(parts)].join(', '),
			type: r.addresstype ?? r.type ?? '',
			lat: Number(r.lat),
			lon: Number(r.lon),
			osm: `${r.osm_type}/${r.osm_id}`,
			...(wikidata && /^Q\d+$/.test(wikidata) ? { wikidata } : {})
		};
	});
}

export function searchUrl(q: string, lang = 'en'): string {
	const u = new URL(ENDPOINT);
	u.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', extratags: '1', limit: '6', 'accept-language': lang }).toString();
	return u.toString();
}

const cache = new Map<string, PlaceHit[]>();
let lastRequest = 0;
const wait = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((ok, fail) => {
		const t = setTimeout(ok, ms);
		signal?.addEventListener('abort', () => (clearTimeout(t), fail(new DOMException('Aborted', 'AbortError'))), { once: true });
	});

/** Search for places. Cached; spaced at least a second apart; pass a signal to cancel (e.g. when typing resumes). */
export async function searchPlaces(q: string, opts: { signal?: AbortSignal; fetch?: typeof fetch; lang?: string } = {}): Promise<PlaceHit[]> {
	const key = q.trim().toLowerCase();
	if (key.length < 2) return [];
	const hit = cache.get(key);
	if (hit) return hit;
	const gap = lastRequest + MIN_GAP_MS - Date.now();
	if (gap > 0) await wait(gap, opts.signal);
	lastRequest = Date.now();
	const res = await (opts.fetch ?? fetch)(searchUrl(q.trim(), opts.lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en')), {
		signal: opts.signal,
		headers: { Accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`Place search failed (${res.status})`);
	const out = parseResults((await res.json()) as NominatimResult[]);
	cache.set(key, out);
	return out;
}

/** For tests. */
export const _reset = () => {
	cache.clear();
	lastRequest = 0;
};
