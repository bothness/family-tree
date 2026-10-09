import { describe, expect, it } from 'vitest';
import sample from '../data/example-data.json';
import { migrate } from '../model/migrate.ts';
import { focusSet } from '../model/focus.ts';
import { boundsOf, mapData, toGeoJSON } from './map.ts';

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
		const g = toGeoJSON(m);
		expect(g.features[0].geometry.coordinates).toEqual([m.places[0].lon, m.places[0].lat]);
		const [[w, s], [e, n]] = boundsOf(m)!;
		expect(w).toBeLessThanOrEqual(-8.4756);
		expect(e).toBeGreaterThanOrEqual(-1.5492);
		expect(s).toBeLessThanOrEqual(51.8985);
		expect(n).toBeGreaterThanOrEqual(53.7997);
		expect(boundsOf({ places: [], unmapped: [] })).toBeNull();
	});
});
