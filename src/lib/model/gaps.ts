// Research to-do list derived from uncertainty markers. Never stored.
import type { Dataset } from './types.ts';
import { fmtDate } from './edtf.ts';
import { childIds, displayName, famLabel, isLiving, lifeEvent, partnerIds, person, primaryName } from './queries.ts';

export type GapKind = 'missing' | 'guess' | 'todo' | 'check';
export interface Gap { kind: GapKind; text: string }

export function gaps(d: Dataset): Record<string, Gap[]> {
	const out: Record<string, Gap[]> = {};
	const add = (pid: string | undefined, kind: GapKind, text: string) => {
		if (pid) (out[pid] ??= []).push({ kind, text });
	};
	for (const p of d.people) {
		if (p.placeholder) add(p.id, 'missing', 'Placeholder – identity unknown');
		else {
			if (!p.names?.length) add(p.id, 'missing', 'No name recorded');
			p.names
				?.filter((n) => n.status === 'guess')
				.forEach((n) => add(p.id, 'guess', `${n === primaryName(p) ? 'Name' : (n.type ?? 'other') + ' name'} is a guess`));
			const b = lifeEvent(d, p.id, 'birth');
			if (!b) add(p.id, 'missing', 'No birth date or place');
			else if (b.date?.status === 'guess') add(p.id, 'guess', `Birth date is a guess (${fmtDate(b.date.edtf)})`);
			const x = lifeEvent(d, p.id, 'death');
			if (p.deceased && !x?.date) add(p.id, 'missing', 'Date of death not recorded');
			else if (x?.date?.status === 'guess') add(p.id, 'guess', `Death date is a guess (${fmtDate(x.date.edtf)})`);
			if (!p.deceased && !x && !isLiving(d, p)) add(p.id, 'check', 'Born over 110 years ago – mark as deceased?');
		}
		p.research?.todo?.forEach((t) => add(p.id, 'todo', t));
	}
	for (const f of d.families) {
		const ps = partnerIds(f);
		const pid = ps[0] ?? childIds(f)[0];
		if (!pid) continue;
		const label = famLabel(d, f);
		if (f.childrenComplete === 'no') {
			const min = f.expectedChildren?.min,
				have = f.children.length;
			add(pid, 'missing', `Children of ${label}: ${min != null && min > have ? `${min - have} more expected` : 'some missing'}`);
		} else if (f.childrenComplete !== 'yes' && ps.length) add(pid, 'check', `Children of ${label}: not yet known if complete`);
		if (f.relationship?.status === 'guess') add(pid, 'guess', `Partnership of ${label} is a guess`);
		f.children
			.filter((c) => c.status === 'guess')
			.forEach((c) => add(c.personId, 'guess', `Parents of ${displayName(person(d, c.personId))} are a guess`));
	}
	return out;
}

export const gapCount = (d: Dataset) => Object.values(gaps(d)).reduce((a, x) => a + x.length, 0);
