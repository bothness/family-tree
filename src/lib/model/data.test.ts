// Schema, migration and derived-data checks against the sample dataset.
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../schema/family-tree.schema.json';
import sample from '../data/example-data.json';
import { migrate } from './migrate.ts';
import { gaps } from './gaps.ts';
import { components, isLiving, person } from './queries.ts';
import { timelineRows } from '../layout/timeline.ts';
import { layoutTree } from '../layout/tree.ts';
import { focusSet, type FocusOptions } from './focus.ts';

const fresh = () => migrate(structuredClone(sample));

describe('schema', () => {
	it('sample data validates against the JSON Schema', () => {
		const ajv = new Ajv({ allErrors: true, strict: false });
		addFormats(ajv);
		const validate = ajv.compile(schema);
		const valid = validate(sample);
		expect(validate.errors ?? []).toEqual([]);
		expect(valid).toBe(true);
	});
});

describe('migrate v0.1 → v0.2', () => {
	const v01 = {
		schemaVersion: '0.1',
		people: [{ id: 'per_a', names: [{ given: 'A', status: 'probable' }], living: true }, { id: 'per_b', names: [{ given: 'B' }] }],
		families: [{ id: 'fam_x', partners: [{ personId: 'per_a' }, { personId: 'per_b' }], children: [] }],
		events: [
			{ id: 'evt_m', type: 'marriage', familyId: 'fam_x', date: { edtf: '1900' }, participants: [{ personId: 'per_a' }] },
			{ id: 'evt_d', type: 'death', participants: [{ personId: 'per_b' }] }
		]
	};
	const d = migrate(structuredClone(v01));
	it('renames probable to likely', () => expect(d.people[0].names![0].status).toBe('likely'));
	it('folds marriage events into the relationship', () => {
		expect(d.families[0].relationship?.start?.edtf).toBe('1900');
		expect(d.events.map((e) => e.type)).toEqual(['death']);
	});
	it('derives deceased from death events and drops living', () => {
		expect(d.people[1].deceased).toBe(true);
		expect('living' in d.people[0]).toBe(false);
	});
	it('leaves v0.2 data alone', () => expect(migrate(fresh())).toEqual(fresh()));
});

describe('sample data', () => {
	const d = fresh();
	it('has two unconnected branches', () => expect(components(d).map((c) => c.length)).toEqual([4, 3]));
	it('treats people born over 110 years ago as not living', () => expect(isLiving(d, person(d, 'per_thomas_smith')!)).toBe(false));
	it('reports missing children for the Smiths', () => {
		const g = gaps(d)['per_john_smith'].map((x) => x.text).join('\n');
		expect(g).toMatch(/2 more expected/);
	});
	it('timeline puts people in birth order', () => {
		const { rows } = timelineRows(d, d.people.map((p) => p.id));
		expect(rows[0].id).toBe('per_john_smith');
	});
});

describe('interim tree layout', () => {
	const d = fresh();
	const L = layoutTree(d, components(d).map((ids) => ({ label: '', ids })));
	const pos = (id: string) => L.nodes.find((n) => n.id === id)!;
	it('places every person once', () => expect(L.nodes).toHaveLength(d.people.length));
	it('puts the father left of the mother', () => expect(pos('per_john_smith').x).toBeLessThan(pos('per_mary_smith').x));
	it('orders siblings by earliest possible birth date', () => {
		// Ann "188X" (1880–89) can be earlier than Thomas (Mar 1885), so she sorts first.
		expect(pos('per_ann_smith').x).toBeLessThan(pos('per_thomas_smith').x);
	});
	it('places children below parents', () => expect(pos('per_thomas_smith').y).toBeGreaterThan(pos('per_john_smith').y));
	it('shows a placeholder for expected missing children', () => expect(L.ghosts[0]).toMatchObject({ familyId: 'fam_smith_walker', missing: 2 }));
});

describe('tree layout in focus mode', () => {
	const d = fresh();
	const focusLayout = (root: string, o: FocusOptions) => layoutTree(d, [{ label: '', ids: [...focusSet(d, root, o).ids] }]);

	it('keeps the "missing children" placeholder when all known children are in view', () => {
		expect(focusLayout('per_thomas_smith', { up: 1, down: 0, width: 'siblings' }).ghosts.map((g) => g.familyId)).toEqual(['fam_smith_walker']);
	});

	it('drops it when the focus hides some of the children (an edge marker shows instead)', () => {
		expect(focusLayout('per_thomas_smith', { up: 1, down: 0, width: 'direct' }).ghosts).toEqual([]);
		expect(focusLayout('per_john_smith', { up: 0, down: 0, width: 'direct' }).ghosts).toEqual([]);
		expect(focusSet(d, 'per_john_smith', { up: 0, down: 0, width: 'direct' }).edges).toContainEqual({ dir: 'down', familyId: 'fam_smith_walker', hidden: 2 });
	});
});
