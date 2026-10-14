import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../schema/family-tree.schema.json';
import sample from '../data/example-data.json';
import type { Dataset } from './types.ts';
import { migrate } from './migrate.ts';
import { subsetDataset } from './subset.ts';

const data = () => migrate(structuredClone(sample) as unknown as Dataset);
const valid = (d: Dataset) => {
	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);
	const v = ajv.compile(schema);
	return v(d) ? [] : v.errors!.map((e) => `${e.instancePath} ${e.message}`);
};

describe('subsetDataset', () => {
	it('keeps only the people in view, with their families, events, places and sources', () => {
		const d = data();
		d.media.push({ id: 'media_john', kind: 'image', mime: 'image/jpeg', width: 1, height: 1, thumb: '' }, { id: 'media_other', kind: 'image', mime: 'image/jpeg', width: 1, height: 1, thumb: '' });
		d.people.find((p) => p.id === 'per_john_smith')!.photo = 'media_john';
		d.views.push({ id: 'view_x', name: 'Smiths', kind: 'tree', scope: { tags: ['smith'] } });
		const s = subsetDataset(d, ['per_john_smith', 'per_mary_smith', 'per_thomas_smith']);
		expect(s.people.map((p) => p.id).sort()).toEqual(['per_john_smith', 'per_mary_smith', 'per_thomas_smith']);
		const fam = s.families.find((f) => f.id === 'fam_smith_walker')!;
		expect(fam.children.map((c) => c.personId)).toEqual(['per_thomas_smith']);
		expect(s.events.every((e) => e.participants.every((x) => ['per_john_smith', 'per_mary_smith', 'per_thomas_smith'].includes(x.personId)))).toBe(true);
		expect(s.sources.map((x) => x.id).sort()).toEqual(['src_aunt_jean', 'src_birth_thomas', 'src_census_1891_leeds', 'src_marriage_1883']);
		expect(s.places.map((x) => x.name).sort()).toEqual(['Bradford', 'Leeds']);
		expect(s.media.map((m) => m.id)).toEqual(['media_john']);
		expect(s.views).toEqual([]);
		expect(valid(s)).toEqual([]);
	});

	it('drops families left saying nothing, and leaves the original untouched', () => {
		const d = data();
		const before = JSON.stringify(d);
		const s = subsetDataset(d, ['per_thomas_smith']);
		expect(s.families).toEqual([]);
		expect(s.people).toHaveLength(1);
		expect(JSON.stringify(d)).toBe(before);
		expect(valid(s)).toEqual([]);
	});
});
