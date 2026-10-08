// Bring older or partial data up to schema v0.2.
import type { Dataset } from './types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export function tidy(d: Loose): Dataset {
	d.people ??= [];
	d.families ??= [];
	d.events ??= [];
	d.places ??= [];
	d.sources ??= [];
	d.views ??= [];
	for (const f of d.families) {
		f.partners ??= [];
		f.children ??= [];
	}
	return d as Dataset;
}

/** Upgrade v0.1 data: probable→likely, living→deceased, marriage events→relationship.start. */
export function migrate(input: Loose): Dataset {
	const d = tidy(input);
	if ((d.schemaVersion as string) === '0.2') return d;
	const walk = (o: Loose): void => {
		if (Array.isArray(o)) o.forEach(walk);
		else if (o && typeof o === 'object')
			for (const k in o) {
				if (k === 'status' && o[k] === 'probable') o[k] = 'likely';
				else walk(o[k]);
			}
	};
	walk(d);
	for (const p of d.people as Loose[]) {
		if (p.living === false) p.deceased = true;
		delete p.living;
		if (p.sex?.value === 'X') p.sex.value = 'U';
		if (d.events.some((e) => ['death', 'burial'].includes(e.type) && e.participants.some((x) => x.personId === p.id)))
			p.deceased = true;
	}
	for (const e of d.events.filter((e) => e.type === 'marriage' && e.familyId)) {
		const f = d.families.find((f) => f.id === e.familyId);
		if (f && e.date && !f.relationship?.start) f.relationship = { ...(f.relationship ?? {}), start: e.date };
	}
	d.events = d.events.filter((e) => !(e.type === 'marriage' && e.familyId));
	d.schemaVersion = '0.2';
	return d;
}
