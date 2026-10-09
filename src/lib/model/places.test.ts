import { beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from './types.ts';
import { emptyDataset, newPerson, setLife } from './mutations.ts';
import { lifeEvent } from './queries.ts';
import { isLinked, knownPlaces, linkPlace, placeFromLookup, placeUses, setLifePlace, unlinkPlace, type FoundPlace } from './places.ts';

const leeds: FoundPlace = { name: 'Leeds', context: 'West Yorkshire, England, United Kingdom', type: 'city', lat: 53.7974, lon: -1.5438, osm: 'relation/118362', wikidata: 'Q39121' };
let d: Dataset;
let ann: string;
beforeEach(() => {
	d = emptyDataset();
	ann = newPerson(d, 'Ann Smith').id;
});

describe('places', () => {
	it('saves a looked-up place with its position and links', () => {
		const id = placeFromLookup(d, leeds);
		expect(d.places.find((p) => p.id === id)).toMatchObject({
			name: 'Leeds',
			context: 'West Yorkshire, England, United Kingdom',
			coordinates: { lat: 53.7974, lon: -1.5438 },
			links: { osm: 'relation/118362', wikidata: 'Q39121' }
		});
	});

	it('reuses a looked-up place rather than adding it twice', () => {
		expect(placeFromLookup(d, leeds)).toBe(placeFromLookup(d, leeds));
		expect(d.places).toHaveLength(1);
	});

	it('sets and clears the place of a birth, keeping the date', () => {
		setLife(d, ann, 'birth', '1880', null);
		const id = placeFromLookup(d, leeds);
		setLifePlace(d, ann, 'birth', id);
		expect(lifeEvent(d, ann, 'birth')?.place?.placeId).toBe(id);
		expect(placeUses(d, id)).toBe(1);
		setLifePlace(d, ann, 'birth', null);
		expect(lifeEvent(d, ann, 'birth')?.date?.edtf).toBe('1880');
		expect(lifeEvent(d, ann, 'birth')?.place).toBeUndefined();
	});

	it('removes a birth event left with neither date nor place', () => {
		setLifePlace(d, ann, 'birth', placeFromLookup(d, leeds));
		setLifePlace(d, ann, 'birth', null);
		expect(lifeEvent(d, ann, 'birth')).toBeUndefined();
	});

	it('finds places already used, by name or former name', () => {
		setLife(d, ann, 'birth', null, 'Kingstown');
		const k = d.places[0];
		k.altNames = [{ name: 'Dún Laoghaire', period: '1920/..' }];
		placeFromLookup(d, leeds);
		expect(knownPlaces(d, 'king').map((p) => p.name)).toEqual(['Kingstown']);
		expect(knownPlaces(d, 'dún').map((p) => p.name)).toEqual(['Kingstown']);
		expect(knownPlaces(d, 'york').map((p) => p.name)).toEqual([]); // context isn't searched
	});

	it('links a hand-written place in place, so every event using it gets the map position', () => {
		setLife(d, ann, 'birth', null, 'Leeds');
		const other = newPerson(d, 'Bob').id;
		setLife(d, other, 'death', null, 'leeds');
		const p = d.places[0];
		expect(placeUses(d, p.id)).toBe(2);
		linkPlace(p, leeds);
		expect(p).toMatchObject({ name: 'Leeds', coordinates: { lat: 53.7974, lon: -1.5438 }, links: { osm: 'relation/118362', wikidata: 'Q39121' } });
		expect(d.places).toHaveLength(1);
	});

	it("keeps a place's own name when linking, adding the lookup's as another name", () => {
		setLife(d, ann, 'birth', null, 'Leedes');
		const p = d.places[0];
		linkPlace(p, leeds);
		expect(p.name).toBe('Leedes');
		expect(p.altNames).toEqual([{ name: 'Leeds' }]);
	});

	it('can turn a looked-up place back into a hand-written one', () => {
		const id = placeFromLookup(d, leeds);
		const p = d.places.find((p) => p.id === id)!;
		expect(isLinked(p)).toBe(true);
		unlinkPlace(p);
		expect(isLinked(p)).toBe(false);
		expect(p).toEqual({ id: p.id, name: 'Leeds', type: 'city' });
	});
});
