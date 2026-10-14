// Timeline events: marriages, divorces and children's births, on a small hand-built family.
import { describe, expect, it } from 'vitest';
import { emptyDataset } from '../model/mutations.ts';
import type { Dataset } from '../model/types.ts';
import { timelineEvents, timelineRows } from './timeline.ts';

function family(): Dataset {
	const d = emptyDataset();
	const born = (id: string, edtf?: string) => {
		d.people.push({ id, names: [{ given: id }] });
		if (edtf) d.events.push({ id: 'b_' + id, type: 'birth', date: { edtf }, participants: [{ personId: id }] });
	};
	born('ann', '1900');
	born('bob', '1898');
	born('cal', '1925'); // Ann's second husband
	born('kid', '1922');
	born('late', '1950'); // born long after Bob's bar would otherwise end
	born('nodate');
	born('step', '1926?');
	d.people.push({ id: 'ph', placeholder: true });
	d.families.push(
		{
			id: 'f1',
			partners: [{ personId: 'ann' }, { personId: 'bob' }],
			relationship: { type: 'marriage', start: { edtf: '1920' }, end: { edtf: '1930' }, endReason: 'divorce' },
			children: [{ personId: 'kid' }, { personId: 'nodate' }, { personId: 'ph' }]
		},
		{
			id: 'f2',
			partners: [{ personId: 'ann' }, { personId: 'cal' }],
			relationship: { type: 'marriage', status: 'likely', start: { edtf: '1940' }, end: { edtf: '1970' }, endReason: 'death' },
			children: [{ personId: 'step', relation: 'adopted' }]
		},
		{ id: 'f3', partners: [{ personId: 'bob' }], children: [{ personId: 'late' }] }
	);
	return d;
}

describe('timeline events', () => {
	const d = family();
	const ev = (id: string) => timelineEvents(d, id).map((e) => `${e.kind} ${e.other ?? '?'} ${e.at}`);

	it('lists marriages, divorces and dated children, in date order', () => {
		expect(ev('ann')).toEqual(['marriage bob 1920.5', 'child kid 1922.5', 'child step 1926.5', 'end bob 1930.5', 'marriage cal 1940.5']);
	});

	it('puts a child on both parents, and leaves out undated children and placeholders', () => {
		expect(ev('bob')).toEqual(['marriage ann 1920.5', 'child kid 1922.5', 'end ann 1930.5', 'child late 1950.5']);
	});

	it('marks unsure dates and links', () => {
		const step = timelineEvents(d, 'ann').find((e) => e.other === 'step')!;
		expect([step.dateUnsure, step.linkUnsure]).toEqual([true, true]);
		const m = timelineEvents(d, 'cal').find((e) => e.kind === 'marriage')!;
		expect([m.dateUnsure, m.linkUnsure]).toEqual([false, true]);
		expect(timelineEvents(d, 'kid')).toEqual([]);
	});

	it('runs the bar to the last known event when there is no death date', () => {
		const bob = timelineRows(d, ['bob']).rows[0];
		expect(bob.solidEnd).toBe(1951);
	});

	it('starts the bar at the first event when there is no birth date', () => {
		const d = family();
		d.events = d.events.filter((e) => e.id !== 'b_cal');
		d.events.push({ id: 'd_cal', type: 'death', date: { edtf: '1990' }, participants: [{ personId: 'cal' }] });
		d.families.find((f) => f.id === 'f2')!.children = []; // so his first event is the 1940 marriage
		const cal = timelineRows(d, ['cal']).rows[0];
		expect([cal.start, cal.solidStart, cal.solidEnd]).toEqual([1920, 1940, 1990]);
		// with no events before it, 20 years before death as before
		d.families = d.families.filter((f) => f.id !== 'f2');
		expect(timelineRows(d, ['cal']).rows[0].solidStart).toBe(1970);
	});
});
