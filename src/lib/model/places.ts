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

const foldName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** Other places that may be the same as this one: the same name (or former name), or the same OSM place. */
export function duplicatesOf(d: Dataset, id: string): Place[] {
	const p = d.places.find((x) => x.id === id);
	if (!p) return [];
	const names = new Set([p.name, ...(p.altNames ?? []).map((a) => a.name)].map(foldName));
	return d.places.filter(
		(q) => q.id !== id && ((p.links?.osm && q.links?.osm === p.links.osm) || [q.name, ...(q.altNames ?? []).map((a) => a.name)].some((n) => names.has(foldName(n))))
	);
}

/** Which of two places to keep when merging: the one on the map, else the more used, else `a`. */
export function mergeTarget(d: Dataset, a: string, b: string): string {
	const pa = d.places.find((x) => x.id === a),
		pb = d.places.find((x) => x.id === b);
	if (isLinked(pa) !== isLinked(pb)) return isLinked(pa) ? a : b;
	return placeUses(d, b) > placeUses(d, a) ? b : a;
}

/** Merge place `goneId` into `keepId`: its events move across, its name becomes a former name if different, and
 *  anything the kept place lacks (map position, links, wider area) is filled in from it. Then it's removed. */
export function mergePlaces(d: Dataset, keepId: string, goneId: string) {
	const keep = d.places.find((p) => p.id === keepId),
		gone = d.places.find((p) => p.id === goneId);
	if (!keep || !gone || keep === gone) return;
	for (const e of d.events) if (e.place?.placeId === goneId) e.place.placeId = keepId;
	const known = new Set([keep.name, ...(keep.altNames ?? []).map((a) => a.name)].map(foldName));
	for (const a of [{ name: gone.name }, ...(gone.altNames ?? [])])
		if (!known.has(foldName(a.name))) {
			if (!keep.altNames) keep.altNames = [];
			keep.altNames.push({ ...a });
			known.add(foldName(a.name));
		}
	if (!keep.coordinates && gone.coordinates) keep.coordinates = { ...gone.coordinates };
	if (!keep.context && gone.context) keep.context = gone.context;
	if (!keep.type && gone.type) keep.type = gone.type;
	if (gone.links) keep.links = { ...gone.links, ...(keep.links ?? {}) };
	if (!keep.notes && gone.notes) keep.notes = gone.notes;
	d.places = d.places.filter((p) => p.id !== goneId);
	// Anything else pointing at the removed place (a parent place) now points at the kept one.
	for (const p of d.places) if (p.parentId === goneId) p.parentId = keepId;
}
