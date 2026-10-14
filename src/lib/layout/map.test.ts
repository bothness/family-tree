import { describe, expect, it } from 'vitest';
import sample from '../data/example-data.json';
import { migrate } from '../model/migrate.ts';
import { focusSet } from '../model/focus.ts';
import { emptyDataset } from '../model/mutations.ts';
import type { Dataset } from '../model/types.ts';
import { boundsOf, CLUSTER_MAX_ZOOM, clusterPlaces, mapData, placeLinks, toGeoJSON } from './map.ts';

const d = migrate(structuredClone(sample));
const all = d.people.map((p) => p.id);

describe('map data', () => {
	it('puts births and deaths at places with a map position, most used first', () => {
		const m = mapData(d, all);
		const leeds = m.places.find((p) => p.name === 'Leeds')!;
		expect(m.places[0].name).toBe('Leeds');
		expect(leeds.events.some((e) => e.personId === 'per_thomas_smith' && e.kind === 'birth' && e.date === 'Mar 1885')).toBe(true);
		expect(m.places.find((p) => p.name === 'Cork')!.events.map((e) => e.name)).toEqual(['Bridget Murphy']);
	});

	it('lists places written by hand separately, so the gap stays visible', () => {
		const m = mapData(d, all);
		expect(m.unmapped.map((u) => u.name)).toEqual(expect.arrayContaining(['Bradford', 'Wakefield']));
		expect(m.places.some((p) => p.name === 'Bradford')).toBe(false);
	});

	it('only includes people in view', () => {
		const ids = focusSet(d, 'per_bridget_murphy', { up: 0, down: 0, width: 'direct' }).ids;
		const m = mapData(d, ids);
		expect(m.places.map((p) => p.name)).toEqual(['Cork']);
		expect(m.unmapped).toEqual([]);
	});

	it('makes GeoJSON points (lon, lat) and a bounding box', () => {
		const m = mapData(d, all);
		const g = toGeoJSON(clusterPlaces(m).at(-1)!);
		expect(g.features[0].geometry.coordinates).toEqual([m.places[0].lon, m.places[0].lat]);
		const [[w, s], [e, n]] = boundsOf(m)!;
		expect(w).toBeLessThanOrEqual(-8.4756);
		expect(e).toBeGreaterThanOrEqual(-1.5492);
		expect(s).toBeLessThanOrEqual(51.8985);
		expect(n).toBeGreaterThanOrEqual(53.7997);
		expect(boundsOf({ places: [], unmapped: [] })).toBeNull();
	});
});

// Leeds and Bradford are 14 km apart, York 35 km from Leeds, Cork far away.
function towns(): Dataset {
	const d = emptyDataset();
	const at: Record<string, [number, number]> = { leeds: [53.8, -1.55], bradford: [53.79, -1.76], york: [54.0, -1.08], cork: [51.9, -8.47], nowhere: [0, 0] };
	for (const [id, [lat, lon]] of Object.entries(at)) d.places.push({ id, name: id[0].toUpperCase() + id.slice(1), coordinates: id === 'nowhere' ? undefined : { lat, lon } });
	const life = (pid: string, born?: string, died?: string) => {
		d.people.push({ id: pid, names: [{ given: pid }] });
		if (born) d.events.push({ id: 'b' + pid, type: 'birth', date: { edtf: '1850' }, place: { placeId: born }, participants: [{ personId: pid }] });
		if (died) d.events.push({ id: 'd' + pid, type: 'death', date: { edtf: '1900' }, place: { placeId: died }, participants: [{ personId: pid }] });
	};
	life('ann', 'leeds', 'bradford'); // at both places in the Leeds group, counted once
	life('bob', 'leeds', 'cork');
	life('cat', 'york', 'leeds');
	life('dan', 'leeds', 'cork');
	life('eve', 'leeds', 'leeds');
	life('fay', 'leeds', 'nowhere');
	return d;
}

describe('map clusters', () => {
	const d = towns();
	const ids = d.people.map((p) => p.id);
	const levels = clusterPlaces(mapData(d, ids));
	const at = (z: number) => levels[z].map((c) => `${c.placeIds.join('+')} ${c.people}`).sort();

	it('groups nearby places, counting each person once', () => {
		expect(at(3)).toEqual(['bradford+leeds+york 6', 'cork 2']);
		expect(at(CLUSTER_MAX_ZOOM + 1)).toEqual(['bradford 1', 'cork 2', 'leeds 6', 'york 1']);
	});

	it('splits a group further in at each click, the closest places last', () => {
		const top = levels[3].find((c) => c.placeIds.length === 3)!;
		const next = levels[top.splitsAt].find((c) => c.placeIds.includes('leeds'))!;
		expect(next.placeIds).toEqual(['bradford', 'leeds']);
		expect(next.splitsAt).toBeGreaterThan(top.splitsAt);
		expect(levels[next.splitsAt].find((c) => c.placeIds.includes('leeds'))!.placeIds).toEqual(['leeds']);
		expect(levels[CLUSTER_MAX_ZOOM + 1].every((c) => c.splitsAt === Infinity)).toBe(true);
	});
});

describe('map links', () => {
	const d = towns();
	const ids = d.people.map((p) => p.id);
	it('joins people born at a place to where they died, and the other way round, one line per place', () => {
		const ls = placeLinks(d, ids, 'leeds');
		const by = (id: string) => ls.find((l) => l.toPlaceId === id)!;
		expect(ls.map((l) => l.toPlaceId).sort()).toEqual(['bradford', 'cork', 'york']);
		expect(by('cork').people.map((p) => p.name)).toEqual(['bob', 'dan']);
		expect(by('york').people[0]).toEqual({ personId: 'cat', name: 'cat', born: 'York, 1850', died: 'Leeds, 1900' });
		expect(by('cork').from).toEqual([-1.55, 53.8]);
	});
	it('only includes people in view', () => {
		expect(placeLinks(d, ['bob'], 'cork').map((l) => l.people.length)).toEqual([1]);
	});
});
