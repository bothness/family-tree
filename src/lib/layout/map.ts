// What the map shows (V12): each place with a map position, and the births, deaths and marriages there among the people in
// view (focus or saved view, like every other tab). Places written by hand have no position, so they're listed
// separately to keep the gap visible. Places close together on screen are grouped (`clusterPlaces`), and an open place
// links each person born there who died elsewhere, or the other way round, to that other place (`placeLinks`).
import type { Dataset } from '../model/types.ts';
import { birthStart, displayName, partnerIds, person } from '../model/queries.ts';
import { fmtDate } from '../model/edtf.ts';

export interface MapEvent { personId: string; name: string; kind: 'birth' | 'death' | 'marriage' | 'partnership'; date: string }
export interface MapPlace {
	placeId: string;
	name: string;
	context: string;
	lat: number;
	lon: number;
	events: MapEvent[];
	/** The people in view born, died or married there, each once (a marriage counts both partners in view). */
	people: string[];
}
export interface MapData {
	places: MapPlace[];
	/** Places used by people in view that have no map position yet (written by hand). */
	unmapped: { placeId: string; name: string; uses: number }[];
}

export function mapData(d: Dataset, ids: Iterable<string>): MapData {
	const inView = new Set(ids);
	const byPlace = new Map<string, MapEvent[]>();
	const who = new Map<string, Set<string>>();
	const met = (placeId: string, pid: string) => (who.get(placeId) ?? who.set(placeId, new Set()).get(placeId)!).add(pid);
	for (const e of d.events) {
		if ((e.type !== 'birth' && e.type !== 'death') || !e.place) continue;
		const pid = e.participants[0]?.personId;
		if (!pid || !inView.has(pid) || !person(d, pid)) continue;
		const list = byPlace.get(e.place.placeId) ?? byPlace.set(e.place.placeId, []).get(e.place.placeId)!;
		list.push({ personId: pid, name: displayName(person(d, pid)), kind: e.type, date: fmtDate(e.date?.edtf) });
		met(e.place.placeId, pid);
	}
	// Where couples married (or their partnership began), when either is in view.
	for (const f of d.families) {
		const r = f.relationship;
		const ps = partnerIds(f).filter((x) => person(d, x));
		const pid = ps.find((x) => inView.has(x));
		if (!r?.place || !pid) continue;
		const list = byPlace.get(r.place.placeId) ?? byPlace.set(r.place.placeId, []).get(r.place.placeId)!;
		list.push({ personId: pid, name: ps.map((x) => displayName(person(d, x))).join(' & '), kind: r.type === 'marriage' || r.type === 'civil-partnership' ? 'marriage' : 'partnership', date: fmtDate(r.start?.edtf) });
		for (const x of ps) if (inView.has(x)) met(r.place.placeId, x);
	}
	const places: MapPlace[] = [],
		unmapped: MapData['unmapped'] = [];
	for (const [placeId, events] of byPlace) {
		const p = d.places.find((x) => x.id === placeId);
		if (!p) continue;
		events.sort((a, b) => birthStart(d, a.personId) - birthStart(d, b.personId) || a.name.localeCompare(b.name));
		if (p.coordinates) places.push({ placeId, name: p.name, context: p.context ?? '', lat: p.coordinates.lat, lon: p.coordinates.lon, events, people: [...who.get(placeId)!] });
		else unmapped.push({ placeId, name: p.name, uses: events.length });
	}
	places.sort((a, b) => b.people.length - a.people.length || b.events.length - a.events.length || a.name.localeCompare(b.name));
	unmapped.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
	return { places, unmapped };
}

export interface MapCluster {
	/** The places in it, sorted; joined, they're its key. */
	placeIds: string[];
	lon: number;
	lat: number;
	/** People in view at any of its places, each counted once. */
	people: number;
	/** The zoom at which it splits up (Infinity for a single place). */
	splitsAt: number;
}

/** Places are grouped at zoom levels up to this; above it every place is on its own. */
export const CLUSTER_MAX_ZOOM = 16;

/** Web Mercator, 0–1 across the world. */
function mercator(lon: number, lat: number): [number, number] {
	const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
	return [lon / 360 + 0.5, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}
const unmercator = (x: number, y: number): [number, number] => [(x - 0.5) * 360, (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI];

/**
 * Places grouped for each whole zoom level, 0 to CLUSTER_MAX_ZOOM + 1 (the last has every place on its own). At each
 * level, places closer than `radius` screen pixels (512-pixel tiles, as MapLibre draws them) are grouped, the
 * biggest first, like MapLibre's own clustering. Each level is built from the one above it, so a group only ever
 * splits as you zoom in, and places very close together stay grouped for longer.
 */
export function clusterPlaces(m: MapData, radius = 50): MapCluster[][] {
	interface Node { ids: string[]; x: number; y: number; n: number; people: Set<string> }
	let level: Node[] = m.places.map((p) => {
		const [x, y] = mercator(p.lon, p.lat);
		return { ids: [p.placeId], x, y, n: 1, people: new Set(p.people) };
	});
	const levels: Node[][] = [];
	levels[CLUSTER_MAX_ZOOM + 1] = level;
	for (let z = CLUSTER_MAX_ZOOM; z >= 0; z--) {
		const r = radius / (512 * 2 ** z);
		const order = [...level].sort((a, b) => b.people.size - a.people.size || (a.ids[0] < b.ids[0] ? -1 : 1));
		const used = new Set<Node>(),
			next: Node[] = [];
		for (const a of order) {
			if (used.has(a)) continue;
			used.add(a);
			const group = [a];
			for (const b of order) if (!used.has(b) && Math.hypot(b.x - a.x, b.y - a.y) <= r) used.add(b), group.push(b);
			if (group.length === 1) {
				next.push(a);
				continue;
			}
			const n = group.reduce((t, g) => t + g.n, 0);
			next.push({
				ids: group.flatMap((g) => g.ids).sort(),
				x: group.reduce((t, g) => t + g.x * g.n, 0) / n,
				y: group.reduce((t, g) => t + g.y * g.n, 0) / n,
				n,
				people: new Set(group.flatMap((g) => [...g.people]))
			});
		}
		levels[z] = level = next;
	}
	const keys = levels.map((l) => new Set(l.map((c) => c.ids.join())));
	const byId = new Map(m.places.map((p) => [p.placeId, p]));
	return levels.map((l, z) =>
		l.map((c) => {
			const key = c.ids.join();
			let splitsAt = Infinity;
			if (c.ids.length > 1) for (splitsAt = z + 1; keys[splitsAt].has(key); splitsAt++);
			const one = c.ids.length === 1 ? byId.get(c.ids[0])! : null;
			const [lon, lat] = one ? [one.lon, one.lat] : unmercator(c.x, c.y);
			return { placeIds: c.ids, lon, lat, people: c.people.size, splitsAt };
		})
	);
}

/** GeoJSON for MapLibre: one point per group of places, with how many people (for the dot size and number). */
export function toGeoJSON(clusters: MapCluster[]) {
	return {
		type: 'FeatureCollection' as const,
		features: clusters.map((c) => ({
			type: 'Feature' as const,
			properties: { key: c.placeIds.join(), places: c.placeIds.length, count: c.people },
			geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] }
		}))
	};
}

export interface LinkPerson { personId: string; name: string; born: string; died: string }
/** A line from an open place to where people born there died, or people who died there were born. */
export interface MapLink { from: [number, number]; to: [number, number]; toPlaceId: string; people: LinkPerson[] }

/** The links from one place: one per other place, with everyone in view who joins the two (born at one, died at
 *  the other). People born and died at the same place, or whose other place has no map position, have none. */
export function placeLinks(d: Dataset, ids: Iterable<string>, placeId: string): MapLink[] {
	const at = (id?: string) => d.places.find((p) => p.id === id);
	const here = at(placeId);
	if (!here?.coordinates) return [];
	const byPlace = new Map<string, MapLink>();
	for (const pid of new Set(ids)) {
		const p = person(d, pid);
		if (!p) continue;
		const ev = (t: string) => d.events.find((e) => e.type === t && e.place && e.participants[0]?.personId === pid);
		const b = ev('birth'),
			x = ev('death');
		if (!b || !x || (b.place!.placeId === placeId) === (x.place!.placeId === placeId)) continue;
		const other = at(b.place!.placeId === placeId ? x.place!.placeId : b.place!.placeId);
		if (!other?.coordinates) continue;
		const said = (e: typeof b) => [at(e.place!.placeId)?.name, fmtDate(e.date?.edtf)].filter(Boolean).join(', ');
		const link =
			byPlace.get(other.id) ??
			byPlace.set(other.id, { from: [here.coordinates.lon, here.coordinates.lat], to: [other.coordinates.lon, other.coordinates.lat], toPlaceId: other.id, people: [] }).get(other.id)!;
		link.people.push({ personId: pid, name: displayName(p), born: said(b), died: said(x) });
	}
	for (const l of byPlace.values()) l.people.sort((a, b) => birthStart(d, a.personId) - birthStart(d, b.personId) || a.name.localeCompare(b.name));
	return [...byPlace.values()];
}

/** The box around all the places, as [[west, south], [east, north]], or null if there are none. */
export function boundsOf(m: MapData): [[number, number], [number, number]] | null {
	if (!m.places.length) return null;
	const lons = m.places.map((p) => p.lon),
		lats = m.places.map((p) => p.lat);
	return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}
