// What the map shows (V12): each place with a map position, and the births and deaths there among the people in
// view (focus or saved view, like every other tab). Places written by hand have no position, so they're listed
// separately to keep the gap visible.
import type { Dataset } from '../model/types.ts';
import { birthStart, displayName, person } from '../model/queries.ts';
import { fmtDate } from '../model/edtf.ts';

export interface MapEvent { personId: string; name: string; kind: 'birth' | 'death'; date: string }
export interface MapPlace { placeId: string; name: string; context: string; lat: number; lon: number; events: MapEvent[] }
export interface MapData {
	places: MapPlace[];
	/** Places used by people in view that have no map position yet (written by hand). */
	unmapped: { placeId: string; name: string; uses: number }[];
}

export function mapData(d: Dataset, ids: Iterable<string>): MapData {
	const inView = new Set(ids);
	const byPlace = new Map<string, MapEvent[]>();
	for (const e of d.events) {
		if ((e.type !== 'birth' && e.type !== 'death') || !e.place) continue;
		const pid = e.participants[0]?.personId;
		if (!pid || !inView.has(pid) || !person(d, pid)) continue;
		const list = byPlace.get(e.place.placeId) ?? byPlace.set(e.place.placeId, []).get(e.place.placeId)!;
		list.push({ personId: pid, name: displayName(person(d, pid)), kind: e.type, date: fmtDate(e.date?.edtf) });
	}
	const places: MapPlace[] = [],
		unmapped: MapData['unmapped'] = [];
	for (const [placeId, events] of byPlace) {
		const p = d.places.find((x) => x.id === placeId);
		if (!p) continue;
		events.sort((a, b) => birthStart(d, a.personId) - birthStart(d, b.personId) || a.name.localeCompare(b.name));
		if (p.coordinates) places.push({ placeId, name: p.name, context: p.context ?? '', lat: p.coordinates.lat, lon: p.coordinates.lon, events });
		else unmapped.push({ placeId, name: p.name, uses: events.length });
	}
	places.sort((a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name));
	unmapped.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
	return { places, unmapped };
}

/** GeoJSON for MapLibre: one point per place, with how many events it has (for the dot size). */
export function toGeoJSON(m: MapData) {
	return {
		type: 'FeatureCollection' as const,
		features: m.places.map((p) => ({
			type: 'Feature' as const,
			id: p.placeId,
			properties: { placeId: p.placeId, name: p.name, count: p.events.length },
			geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }
		}))
	};
}

/** The box around all the places, as [[west, south], [east, north]], or null if there are none. */
export function boundsOf(m: MapData): [[number, number], [number, number]] | null {
	if (!m.places.length) return null;
	const lons = m.places.map((p) => p.lon),
		lats = m.places.map((p) => p.lat);
	return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}
