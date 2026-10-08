// Timeline rows: one lifespan bar per person, with fuzzy ends for approximate/unrecorded dates.
import type { Dataset, Family } from '../model/types.ts';
import { edtfRange, type DateRange } from '../model/edtf.ts';
import { famsAsPartner, isLiving, lifeEvent, NOW, person } from '../model/queries.ts';

export interface TimelineRow {
	id: string;
	birth: DateRange | null;
	death: DateRange | null;
	partnerships: { family: Family; range: DateRange }[];
	living: boolean;
	/** Where the row (label + fade-in) starts. */
	start: number;
	/** Solid bar from solidStart to solidEnd. */
	solidStart: number;
	solidEnd: number;
	/** Where the row ends, including any fade-out. */
	end: number;
	birthIsGuess: boolean;
}

/** Years of fade shown when a death date isn't recorded. */
export const UNKNOWN_END_FADE = 18;

export function timelineRows(d: Dataset, ids: string[]): { rows: TimelineRow[]; undated: string[] } {
	const rows: TimelineRow[] = [],
		undated: string[] = [];
	for (const id of ids) {
		const p = person(d, id);
		if (!p || p.placeholder) continue;
		const b = lifeEvent(d, id, 'birth'),
			x = lifeEvent(d, id, 'death');
		const birth = edtfRange(b?.date?.edtf),
			death = edtfRange(x?.date?.edtf);
		if (!birth && !death) {
			undated.push(id);
			continue;
		}
		const partnerships = famsAsPartner(d, id)
			.map((f) => ({ family: f, range: edtfRange(f.relationship?.start?.edtf) }))
			.filter((x): x is { family: Family; range: DateRange } => !!x.range);
		const living = !death && isLiving(d, p);
		const start = birth ? birth.start : death!.start - 40;
		const solidStart = birth ? birth.end : death!.start - 20;
		const lastKnown = Math.max(solidStart, ...partnerships.map((m) => m.range.end));
		const solidEnd = living ? NOW : death ? death.start : lastKnown;
		rows.push({
			id, birth, death, partnerships, living, start, solidStart, solidEnd,
			end: living ? NOW : death ? death.end : solidEnd + UNKNOWN_END_FADE,
			birthIsGuess: b?.date?.status === 'guess'
		});
	}
	rows.sort((a, b) => a.start - b.start);
	return { rows, undated };
}
