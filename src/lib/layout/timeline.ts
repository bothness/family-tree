// Timeline rows: one lifespan bar per person, with fuzzy ends for approximate/unrecorded dates, and the dated events
// that link them to someone else (a marriage, a divorce, a child's birth).
import type { Dataset, Family } from '../model/types.ts';
import { dateUnsure, edtfRange, type DateRange } from '../model/edtf.ts';
import { famsAsPartner, isLiving, lifeEvent, NOW, partnerIds, person } from '../model/queries.ts';

/** marriage: a marriage or partnership began. end: it ended in divorce, separation or annulment (an end by death is
 *  the end of the bar). child: a child of theirs was born. */
export type TimelineEventKind = 'marriage' | 'end' | 'child';

export interface TimelineEvent {
	kind: TimelineEventKind;
	family: Family;
	/** The partner or child the event links to, if known. */
	other?: string;
	range: DateRange;
	/** Where it's drawn: the middle of its range. */
	at: number;
	/** The date isn't sure. */
	dateUnsure: boolean;
	/** The relationship or parent–child link isn't confirmed. */
	linkUnsure: boolean;
}

export interface TimelineRow {
	id: string;
	birth: DateRange | null;
	death: DateRange | null;
	events: TimelineEvent[];
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
/** With no birth date: the solid bar starts this many years before death (or at their first event, if earlier),
 *  after a fade-in of the same length. */
const UNKNOWN_START = 20;

const unsure = (s?: string) => !!s && s !== 'confirmed';

/** Someone's dated events with partners and children, in date order. */
export function timelineEvents(d: Dataset, id: string): TimelineEvent[] {
	const out: TimelineEvent[] = [];
	const add = (kind: TimelineEventKind, family: Family, edtf: string | undefined, other: string | undefined, linkUnsure: boolean) => {
		const range = edtfRange(edtf);
		if (range) out.push({ kind, family, other, range, at: (range.start + range.end) / 2, dateUnsure: dateUnsure(edtf), linkUnsure });
	};
	for (const f of famsAsPartner(d, id)) {
		const r = f.relationship,
			partner = partnerIds(f).find((x) => x !== id);
		add('marriage', f, r?.start?.edtf, partner, unsure(r?.status));
		if (r?.endReason === 'divorce' || r?.endReason === 'separation' || r?.endReason === 'annulment') add('end', f, r.end?.edtf, partner, unsure(r?.status));
		for (const c of f.children ?? []) {
			if (person(d, c.personId)?.placeholder) continue;
			add('child', f, lifeEvent(d, c.personId, 'birth')?.date?.edtf, c.personId, unsure(c.status) || c.relation === 'adopted');
		}
	}
	return out.sort((a, b) => a.at - b.at);
}

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
		const events = timelineEvents(d, id);
		const living = !death && isLiving(d, p);
		// Without a birth or death date, the solid bar still covers all their dated events, then fades.
		const solidStart = birth ? birth.end : Math.min(death!.start - UNKNOWN_START, ...events.map((e) => e.range.start));
		const start = birth ? birth.start : solidStart - UNKNOWN_START;
		const lastKnown = Math.max(solidStart, ...events.map((e) => e.range.end));
		const solidEnd = living ? NOW : death ? death.start : lastKnown;
		rows.push({
			id, birth, death, events, living, start, solidStart, solidEnd,
			end: living ? NOW : death ? death.end : solidEnd + UNKNOWN_END_FADE,
			birthIsGuess: dateUnsure(b?.date?.edtf)
		});
	}
	rows.sort((a, b) => a.start - b.start);
	return { rows, undated };
}
