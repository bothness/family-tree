// Places (G6): linking events to places, saving places found by the lookup, and finding places already used.
import type { Dataset, Place } from './types.ts';
import { lifeEvent } from './queries.ts';
import { uid } from './mutations.ts';

/** A place found by a lookup service (see places/nominatim.ts). */
export interface FoundPlace {
	name: string;
	context: string;
	type: string;
	lat: number;
	lon: number;
	osm: string;
	wikidata?: string;
}

/** A place as shown in lists: "Leeds", plus "West Yorkshire, England" if known. */
export const placeContext = (p: Place | undefined) => p?.context ?? '';

/** Whether a place came from the lookup (has a map position and OSM link) or was typed in by hand. */
export const isLinked = (p: Place | undefined) => !!p?.links?.osm || !!p?.coordinates;

/** How many events use this place. */
export const placeUses = (d: Dataset, id: string) => d.events.filter((e) => e.place?.placeId === id).length;

/** Places already in the tree whose name (or a former name) starts a word with what's typed. */
export function knownPlaces(d: Dataset, q: string, limit = 5): Place[] {
	const t = q.trim().toLowerCase();
	if (!t) return [];
	const words = (s: string) => s.toLowerCase().split(/[\s,\-']+/);
	const hits = d.places.filter((p) => [p.name, ...(p.altNames ?? []).map((a) => a.name)].some((n) => n.toLowerCase().startsWith(t) || words(n).some((w) => w.startsWith(t))));
	return hits.sort((a, b) => placeUses(d, b.id) - placeUses(d, a.id) || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Save a looked-up place, or reuse it if the same OSM place is already in the tree. Returns its id. */
export function placeFromLookup(d: Dataset, f: FoundPlace): string {
	const existing = d.places.find((p) => p.links?.osm === f.osm);
	if (existing) return existing.id;
	d.places.push({
		id: uid('plc'),
		name: f.name,
		...(f.context ? { context: f.context } : {}),
		...(f.type ? { type: f.type } : {}),
		coordinates: { lat: f.lat, lon: f.lon },
		links: { osm: f.osm, ...(f.wikidata ? { wikidata: f.wikidata } : {}) }
	});
	return d.places.at(-1)!.id;
}

/** Set (or clear, with null) the place of someone's birth or death. */
export function setLifePlace(d: Dataset, pid: string, kind: 'birth' | 'death', placeId: string | null) {
	let e = lifeEvent(d, pid, kind);
	if (!placeId) {
		if (!e) return;
		delete e.place;
		if (!e.date) d.events = d.events.filter((x) => x !== e);
		return;
	}
	if (!e) {
		d.events.push({ id: uid('evt'), type: kind, participants: [{ personId: pid }] });
		e = d.events.at(-1)!;
	}
	e.place = { ...(e.place ?? {}), placeId };
}

/** Link a hand-written place to a looked-up one, so every event already using it gets the map position.
 *  Keeps the place's own name; if it differs from the lookup's, the lookup's name is kept as another name. */
export function linkPlace(p: Place, f: FoundPlace) {
	if (f.name.toLowerCase() !== p.name.toLowerCase() && !p.altNames?.some((a) => a.name === f.name)) {
		if (!p.altNames) p.altNames = [];
		p.altNames.push({ name: f.name });
	}
	if (f.context) p.context = f.context;
	if (f.type && !p.type) p.type = f.type;
	p.coordinates = { lat: f.lat, lon: f.lon };
	p.links = { ...(p.links ?? {}), osm: f.osm, ...(f.wikidata ? { wikidata: f.wikidata } : {}) };
}

/** Turn a looked-up place back into a hand-written one (keeps its name and former names). */
export function unlinkPlace(p: Place) {
	delete p.coordinates;
	delete p.context;
	if (p.links) {
		delete p.links.osm;
		delete p.links.wikidata;
		if (!Object.keys(p.links).length) delete p.links;
	}
}
