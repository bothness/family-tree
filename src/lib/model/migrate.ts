// Bring older or partial data up to schema v0.2. v0.2 → v0.3 (names) is a one-off script, scripts/migrate-0.3.mjs;
// v0.2 data still reads correctly, just with the old name order.
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
	d.media ??= [];
	for (const f of d.families) {
		f.partners ??= [];
		f.children ??= [];
	}
	for (const v of d.views) if (v.scope) upgradeScope(v.scope);
	return d as Dataset;
}

/** Early v0.2 view scopes used direction + generations + includeSpouses; now root + up/down/width. */
function upgradeScope(s: Loose) {
	if (!('direction' in s || 'generations' in s || 'includeSpouses' in s)) return;
	const g = s.generations;
	const set = (k: 'up' | 'down', n: number | undefined) => (n === undefined ? delete s[k] : (s[k] = n));
	switch (s.direction) {
		case 'ancestors':
			set('up', g);
			s.down = 0;
			break;
		case 'descendants':
			s.up = 0;
			set('down', g);
			break;
		case 'connected':
			s.width = 'all';
			break;
		default: // 'both'
			set('up', g);
			set('down', g);
	}
	delete s.direction;
	delete s.generations;
	delete s.includeSpouses;
}

/** Upgrade v0.1 data: probable→likely, living→deceased, marriage events→relationship.start. */
export function migrate(input: Loose): Dataset {
	const d = tidy(input);
	if (['0.2', '0.3'].includes(d.schemaVersion as string)) return d;
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
	(d as Loose).schemaVersion = '0.2'; // v0.2 shape; scripts/migrate-0.3.mjs takes it on to v0.3
	return d;
}
