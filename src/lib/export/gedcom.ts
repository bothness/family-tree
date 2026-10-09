// GEDCOM 5.5.1 export (E1), for other family tree apps and sites. Some things don't carry over, so they're kept as
// notes (readable everywhere) and as underscore tags such as `_STATUS` (which GEDCOM allows for app-specific data):
// - how sure each fact is (GEDCOM only grades sources): a "Certainty" note, plus `_STATUS` on names, events, links
// - research stage, to-dos, tags and links: a "Research" note; a Wikidata id as `REFN … TYPE Wikidata`
// - expected children: `NCHI` (GEDCOM's "number of children") when more are expected than recorded
// Not exported: saved views, places' historical names, and a name's date of use.
import type { Dataset, EdtfDate, Family, LifeEvent, Name, Person, Status } from '../model/types.ts';
import { childIds, displayName, lifeEvent, partnerIds, primaryName } from '../model/queries.ts';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** One EDTF point (no ranges) as a GEDCOM date: "12 FEB 1809", "FEB 1809", "1809"; null if not a date. */
function point(e: string): { date: string; approx: boolean; uncertain: boolean } | null {
	const approx = /[~%]/.test(e),
		uncertain = /[?%]/.test(e);
	const m = e.replace(/[~?%]/g, '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
	if (!m) return null;
	const [, y, mo, d] = m;
	const date = [d ? String(+d) : '', mo ? MONTHS[+mo - 1] : '', y].filter(Boolean).join(' ');
	return { date, approx, uncertain };
}

/** An EDTF date as a GEDCOM 5.5.1 date: `1858~` → `ABT 1858`, `1888?` → `EST 1888`, `188X` → `BET 1880 AND 1889`,
 *  `../1901` → `BEF 1901`, `1901/..` → `AFT 1901`, `1901/1911` → `BET 1901 AND 1911`. Anything else becomes a
 *  date phrase in brackets, which GEDCOM keeps as text. */
export function gedcomDate(e: string | undefined): string {
	if (!e) return '';
	const p = (s: string) => {
		const x = point(s);
		return x ? (x.approx ? 'ABT ' : x.uncertain ? 'EST ' : '') + x.date : null;
	};
	const plain = (s: string) => point(s)?.date ?? null;
	let m: RegExpMatchArray | null;
	if ((m = e.match(/^(\d{2,3})(X+)$/)) && m[1].length + m[2].length === 4)
		return `BET ${m[1].padEnd(4, '0')} AND ${m[1].padEnd(4, '9')}`;
	if ((m = e.match(/^\.\.\/(.+)$/)) && plain(m[1])) return `BEF ${plain(m[1])}`;
	if ((m = e.match(/^(.+)\/\.\.$/)) && plain(m[1])) return `AFT ${plain(m[1])}`;
	if ((m = e.match(/^([^/]+)\/([^/]+)$/)) && plain(m[1]) && plain(m[2])) return `BET ${plain(m[1])} AND ${plain(m[2])}`;
	if ((m = e.match(/^\[(.+)\]$/))) {
		const parts = m[1].split(/,|\.\./).map((x) => plain(x.trim()));
		if (parts.length > 1 && parts.every(Boolean)) return `BET ${parts[0]} AND ${parts.at(-1)}`;
	}
	return p(e) ?? `(${e})`;
}

/** Lines of a GEDCOM file, with long text split over CONT (new line) and CONC (same line) records. */
class Out {
	lines: string[] = [];
	add(level: number, tag: string, value?: string | null) {
		if (value == null || value === '') return void this.lines.push(`${level} ${tag}`);
		const [first, ...rest] = value.replace(/\r\n?/g, '\n').split('\n');
		this.line(level, tag, first, level + 1);
		for (const l of rest) this.line(level + 1, 'CONT', l, level + 1);
	}
	/** GEDCOM lines are at most 255 characters: long text goes on in CONC records (at `more`), split between two
	 *  letters, never next to a space (some apps drop spaces at the ends of lines). */
	private line(level: number, tag: string, text: string, more: number) {
		const MAX = 200;
		let rest = text,
			head = `${level} ${tag}`;
		while (rest.length > MAX) {
			let cut = MAX;
			while (cut > 1 && (rest[cut] === ' ' || rest[cut - 1] === ' ')) cut--;
			this.lines.push(`${head} ${rest.slice(0, cut)}`);
			rest = rest.slice(cut);
			head = `${more} CONC`;
		}
		this.lines.push(rest ? `${head} ${rest}` : head);
	}
}

const NAME_TYPE: Partial<Record<NonNullable<Name['type']>, string>> = {
	birth: 'birth',
	married: 'married',
	alias: 'aka',
	anglicised: 'immigrant',
	'deed-poll': 'deed poll',
	religious: 'religious'
};
const STATUS_WORD: Record<Status, string> = { confirmed: 'confirmed', likely: 'likely', guess: 'a guess', conflicting: 'conflicting sources' };
const unsure = (s?: Status) => !!s && s !== 'confirmed';

export interface GedcomOptions {
	/** Export date for the header (default: today). */
	now?: Date;
	/** Where each photo's file is, relative to the GEDCOM file (for the ZIP export); photos aren't linked otherwise. */
	photoPath?: (mediaId: string) => string | undefined;
}

/** The whole dataset as a GEDCOM 5.5.1 file (UTF-8 text). */
export function toGedcom(d: Dataset, opts: GedcomOptions = {}): string {
	const o = new Out();
	const now = opts.now ?? new Date();
	const indi = new Map(d.people.map((p, i) => [p.id, `@I${i + 1}@`]));
	const fams = d.families.filter((f) => partnerIds(f).some((id) => indi.has(id)) || childIds(f).some((id) => indi.has(id)));
	const fam = new Map(fams.map((f, i) => [f.id, `@F${i + 1}@`]));

	o.add(0, 'HEAD');
	o.add(1, 'SOUR', 'FAMILY_TREE_BUILDER');
	o.add(2, 'NAME', 'Family Tree Builder');
	o.add(2, 'VERS', d.schemaVersion);
	o.add(1, 'DATE', `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
	o.add(1, 'SUBM', '@SUBM1@');
	o.add(1, 'GEDC');
	o.add(2, 'VERS', '5.5.1');
	o.add(2, 'FORM', 'LINEAGE-LINKED');
	o.add(1, 'CHAR', 'UTF-8');
	o.add(0, '@SUBM1@ SUBM');
	o.add(1, 'NAME', 'Family Tree Builder user');

	const place = (lvl: number, e: LifeEvent) => {
		const pl = e.place && d.places.find((x) => x.id === e.place!.placeId);
		if (!pl) return;
		o.add(lvl, 'PLAC', [pl.name, e.place!.detail, pl.context].filter(Boolean).join(', '));
		if (pl.coordinates) {
			const { lat, lon } = pl.coordinates;
			o.add(lvl + 1, 'MAP');
			o.add(lvl + 2, 'LATI', `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat)}`);
			o.add(lvl + 2, 'LONG', `${lon >= 0 ? 'E' : 'W'}${Math.abs(lon)}`);
		}
		if (unsure(e.place!.status)) o.add(lvl + 1, '_STATUS', e.place!.status);
	};
	const date = (lvl: number, dt?: EdtfDate) => {
		if (!dt?.edtf) return;
		o.add(lvl, 'DATE', gedcomDate(dt.edtf));
		if (unsure(dt.status)) o.add(lvl + 1, '_STATUS', dt.status);
	};

	for (const p of d.people) {
		o.add(0, `${indi.get(p.id)} INDI`);
		const unsureFacts: string[] = [];
		const names = [...(p.names ?? [])];
		const first = primaryName(p);
		if (first) names.sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
		if (!names.length) o.add(1, 'NAME', p.placeholder ? 'Unknown //' : '//');
		names.forEach((n, i) => {
			o.add(1, 'NAME', `${n.given ?? ''} /${n.surname ?? ''}/`.trim());
			if (n.given) o.add(2, 'GIVN', n.given);
			if (n.surname) o.add(2, 'SURN', n.surname);
			if (i === 0 && p.knownAs) o.add(2, 'NICK', p.knownAs);
			if (n.type && NAME_TYPE[n.type]) o.add(2, 'TYPE', NAME_TYPE[n.type]);
			if (unsure(n.status)) {
				o.add(2, '_STATUS', n.status);
				unsureFacts.push(`${i ? 'other name' : 'name'}: ${STATUS_WORD[n.status!]}`);
			}
		});
		if (p.sex?.value) o.add(1, 'SEX', p.sex.value);
		for (const kind of ['birth', 'death'] as const) {
			const e = lifeEvent(d, p.id, kind);
			const tag = kind === 'birth' ? 'BIRT' : 'DEAT';
			if (!e) {
				if (kind === 'death' && p.deceased) o.add(1, 'DEAT', 'Y');
				continue;
			}
			o.add(1, tag, !e.date?.edtf && !e.place ? 'Y' : undefined);
			date(2, e.date);
			place(2, e);
			if (unsure(e.date?.status)) unsureFacts.push(`${kind} date: ${STATUS_WORD[e.date!.status!]}`);
			if (unsure(e.place?.status)) unsureFacts.push(`${kind} place: ${STATUS_WORD[e.place!.status!]}`);
		}
		if (p.links?.wikidata) {
			o.add(1, 'REFN', p.links.wikidata);
			o.add(2, 'TYPE', 'Wikidata');
		}
		const photo = p.photo && opts.photoPath?.(p.photo);
		if (photo) {
			o.add(1, 'OBJE');
			o.add(2, 'FILE', photo);
			o.add(3, 'FORM', photo.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg');
		}
		for (const f of fams) {
			if (partnerIds(f).includes(p.id)) o.add(1, 'FAMS', fam.get(f.id)!);
			const c = f.children.find((x) => x.personId === p.id);
			if (c) {
				o.add(1, 'FAMC', fam.get(f.id)!);
				const pedi = { biological: 'birth', adopted: 'adopted', foster: 'foster' }[c.relation as string];
				if (pedi) o.add(2, 'PEDI', pedi);
				if (c.relation === 'step') o.add(2, '_PEDI', 'step');
				if (unsure(c.status)) {
					o.add(2, '_STATUS', c.status);
					unsureFacts.push(`child of ${famName(d, f)}: ${STATUS_WORD[c.status!]}`);
				}
			}
		}
		if (p.notes) o.add(1, 'NOTE', p.notes);
		if (p.sourceNotes) o.add(1, 'NOTE', `Sources:\n${p.sourceNotes}`);
		if (unsureFacts.length) o.add(1, 'NOTE', `Certainty (from Family Tree Builder): ${unsureFacts.join('; ')}.`);
		const research = researchNote(p);
		if (research) o.add(1, 'NOTE', research);
	}

	for (const f of fams) {
		o.add(0, `${fam.get(f.id)} FAM`);
		const ps = f.partners.filter((x) => indi.has(x.personId));
		// GEDCOM 5.5.1 has a husband and a wife: men first, women last, otherwise in order; a lone woman is a wife.
		const rank = (x: { personId: string }) => ({ M: 0, U: 1, F: 2 })[d.people.find((q) => q.id === x.personId)?.sex?.value ?? 'U'];
		const [a, b] = [...ps].sort((x, y) => rank(x) - rank(y));
		const husb = b || (a && rank(a) < 2) ? a : undefined;
		const wife = b ?? (husb ? undefined : a);
		if (husb) o.add(1, 'HUSB', indi.get(husb.personId)!);
		if (wife) o.add(1, 'WIFE', indi.get(wife.personId)!);
		for (const c of f.children) if (indi.has(c.personId)) o.add(1, 'CHIL', indi.get(c.personId)!);
		const r = f.relationship;
		const unsureFacts: string[] = [];
		if (r && (r.type === 'marriage' || r.type === 'civil-partnership')) {
			o.add(1, 'MARR', r.start?.edtf ? undefined : 'Y');
			if (r.type === 'civil-partnership') o.add(2, 'TYPE', 'Civil partnership');
			date(2, r.start);
			if (unsure(r.status)) o.add(2, '_STATUS', r.status);
		} else if (r?.type === 'partnership' && r.start?.edtf) {
			o.add(1, 'EVEN');
			o.add(2, 'TYPE', 'Partnership');
			date(2, r.start);
		}
		if (r?.endReason === 'divorce' || r?.endReason === 'annulment') {
			o.add(1, r.endReason === 'divorce' ? 'DIV' : 'ANUL', r.end?.edtf ? undefined : 'Y');
			date(2, r.end);
		} else if (r?.endReason === 'separation') {
			o.add(1, 'EVEN');
			o.add(2, 'TYPE', 'Separation');
			date(2, r.end);
		}
		if (unsure(r?.status)) unsureFacts.push(`the relationship: ${STATUS_WORD[r!.status!]}`);
		for (const x of ps) if (unsure(x.status)) unsureFacts.push(`${displayName(d.people.find((q) => q.id === x.personId))} as a partner: ${STATUS_WORD[x.status!]}`);
		const n = f.expectedChildren?.min;
		if (n && n > f.children.length) o.add(1, 'NCHI', String(n));
		const notes = [
			r?.type === 'partnership' && 'Not married (a partnership).',
			r?.type === 'unknown' && 'Relationship not known.',
			f.notes,
			f.expectedChildren?.note && `Children: ${f.expectedChildren.note}`,
			f.childrenComplete === 'no' && !n && 'There may be more children.',
			unsureFacts.length && `Certainty (from Family Tree Builder): ${unsureFacts.join('; ')}.`
		].filter(Boolean);
		if (notes.length) o.add(1, 'NOTE', notes.join('\n'));
	}
	o.add(0, 'TRLR');
	return '﻿' + o.lines.join('\r\n') + '\r\n';
}

function famName(d: Dataset, f: Family) {
	const names = partnerIds(f).map((id) => displayName(d.people.find((p) => p.id === id)));
	return names.length ? names.join(' and ') : 'unknown parents';
}

function researchNote(p: Person): string {
	const parts: string[] = [];
	const stage = p.research?.stage;
	if (stage) parts.push(`Research: ${stage === 'in-progress' ? 'in progress' : stage}.`);
	if (p.research?.todo?.length) parts.push(`To do:\n${p.research.todo.map((t) => `- ${t}`).join('\n')}`);
	if (p.tags?.length) parts.push(`Tags: ${p.tags.join(', ')}.`);
	if (p.links?.urls?.length) parts.push(`Links:\n${p.links.urls.map((u) => (u.label ? `${u.label}: ${u.url}` : u.url)).join('\n')}`);
	return parts.join('\n');
}
