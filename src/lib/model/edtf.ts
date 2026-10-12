// EDTF (Extended Date/Time Format) helpers.
// Users type everyday forms ("c.1858", "1880s", "before 1901"); we store EDTF and derive ranges for display.

export interface DateRange { start: number; end: number; span?: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** A month typed as its first three letters or in full, in any case (1–12), or 0. */
const monthOf = (w: string) => {
	const l = w.toLowerCase();
	return MONTH_NAMES.findIndex((n) => n === l || n.slice(0, 3) === l) + 1;
};
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad2 = (n: number) => String(n).padStart(2, '0');

/** One point in time, as typed: a year, decade, month or day, with no marks. */
function point(s: string): string | null {
	let m: RegExpMatchArray | null;
	if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s;
	if ((m = s.match(/^(\d{3})0s$/))) return m[1] + 'X';
	if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) return `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`;
	if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/))) {
		const mo = monthOf(m[2]),
			day = +m[1];
		// A day that doesn't exist in that month (31 Apr, 29 Feb 1900) isn't a date.
		return mo && day >= 1 && day <= daysIn(+m[3], mo) ? `${m[3]}-${pad2(mo)}-${pad2(day)}` : null;
	}
	if ((m = s.match(/^([A-Za-z]+)\s+(\d{4})$/)) && monthOf(m[1])) return `${m[2]}-${pad2(monthOf(m[1]))}`;
	return null;
}

/** A point with its marks: "about" (c.1858 → 1858~), "not sure" (maybe 1858, 1858? → 1858?) or both (1858%). */
function marked(input: string): string | null {
	let s = input.trim(),
		approx = false,
		unsure = false,
		m: RegExpMatchArray | null;
	for (let again = true; again; ) {
		again = false;
		if ((m = s.match(/^(c\.|ca\.|abt\.?|about|circa|~)\s*(.+)$/i)) || (m = s.match(/^(c)\s+(.+)$/i))) [approx, s, again] = [true, m[2], true];
		if ((m = s.match(/^(maybe|perhaps|possibly|probably|prob\.)\s+(.+)$/i))) [unsure, s, again] = [true, m[2], true];
	}
	if ((m = s.match(/^(.+?)\s*([?~%])$/))) {
		s = m[1];
		if (m[2] !== '~') unsure = true;
		if (m[2] !== '?') approx = true;
	}
	const p = point(s);
	if (!p || (p.endsWith('X') && (approx || unsure))) return null;
	return p + (approx && unsure ? '%' : approx ? '~' : unsure ? '?' : '');
}

/** Convert a user-typed date into EDTF. Unrecognised input is returned unchanged. Besides the everyday forms
 *  ("c.1858", "1880s", "before 1901", "1901-1911", "2/6/1883"), dates as the app shows them are understood:
 *  "12 Feb 1809" or "12 February 1809", and "Feb 1809" or "February 1809" (a plain day, a four-digit year).
 *  How sure a date is goes in the date itself: "maybe 1858" or "1858?" (not sure), "c.1858" (about), and
 *  "19 or 20 Aug 1960" (one of these: sources disagree). */
export function parseUserDate(input: string | null | undefined): string {
	const s = (input ?? '').trim();
	if (!s) return '';
	let m: RegExpMatchArray | null;
	// One of several: "1858 or 1859", "19 or 20 Aug 1960", "Aug or Sep 1960". Earlier parts take what they leave
	// out (the month and year) from the last.
	const ors = s.split(/\s+or\s+/i);
	if (ors.length > 1) {
		const last = ors.at(-1)!.trim().split(/\s+/);
		const parts = ors.map((o, i) => {
			const w = o.trim().split(/\s+/);
			return marked(i < ors.length - 1 ? [...w, ...last.slice(w.length)].join(' ') : o);
		});
		return parts.every(Boolean) ? `[${parts.join(',')}]` : s;
	}
	if ((m = s.match(/^(before|bef\.?)\s*(.+)$/i)) && marked(m[2])) return '../' + marked(m[2]);
	if ((m = s.match(/^(after|aft\.?)\s*(.+)$/i)) && marked(m[2])) return marked(m[2]) + '/..';
	if ((m = s.match(/^(.+?)\s*–\s*(.+)$/)) || (m = s.match(/^(.+?)\s+-\s+(.+)$/)) || (m = s.match(/^(\d{4}[?~%]?)-(\d{4}[?~%]?)$/))) {
		const [a, b] = [marked(m[1]), marked(m[2])];
		if (a && b) return `${a}/${b}`;
	}
	return marked(s) ?? s;
}

/** A point as shown: "c.1858", "1858?", "c.1858?", "c. Feb 1858", "1880s", "2 Jun 1883". */
function fmtPoint(e: string): string {
	const m = e.match(/^(.*?)([?~%])?$/)!;
	const core = m[1],
		mark = m[2] ?? '';
	let x: RegExpMatchArray | null,
		base: string;
	if (/^\d{4}$/.test(core)) base = core;
	else if ((x = core.match(/^(\d{3})X$/))) base = x[1] + '0s';
	else if ((x = core.match(/^(\d{4})-(\d{2})$/))) base = `${MONTHS[+x[2] - 1]} ${x[1]}`;
	else if ((x = core.match(/^(\d{4})-(\d{2})-(\d{2})$/))) base = `${+x[3]} ${MONTHS[+x[2] - 1]} ${x[1]}`;
	else return e;
	const about = mark === '~' || mark === '%' ? (/^\d{4}$/.test(core) ? 'c.' : 'c. ') : '';
	return about + base + (mark === '?' || mark === '%' ? '?' : '');
}

/** Human-readable form of an EDTF string. */
export function fmtDate(e: string | null | undefined): string {
	if (!e) return '';
	let m: RegExpMatchArray | null;
	if ((m = e.match(/^\[(.+)\]$/))) {
		const parts = m[1].split(',');
		// Days in one month read as "19 or 20 Aug 1960".
		if (parts.length > 1 && parts.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) && new Set(parts.map((p) => p.slice(0, 7))).size === 1)
			return `${parts.map((p) => +p.slice(8)).join(' or ')} ${MONTHS[+parts[0].slice(5, 7) - 1]} ${parts[0].slice(0, 4)}`;
		return parts.map(fmtPoint).join(' or ');
	}
	if ((m = e.match(/^\.\.\/(.+)$/))) return 'bef. ' + fmtPoint(m[1]);
	if ((m = e.match(/^(.+)\/\.\.$/))) return 'aft. ' + fmtPoint(m[1]);
	if ((m = e.match(/^(.+)\/(.+)$/))) return fmtPoint(m[1]) + '–' + fmtPoint(m[2]);
	return fmtPoint(e);
}

/** Not sure of the date: marked uncertain ("1858?") or one of several ("19 or 20 Aug 1960"). Drawn in pencil. */
export const dateUnsure = (e: string | null | undefined) => !!e && (/[?%]/.test(e) || e.startsWith('['));
/** The same date marked "not sure": 1858 → 1858?, 1858~ → 1858%, each end of a span; one-of dates and decades
 *  (already vague) are left as they are. */
export function unsureDate(e: string): string {
	if (dateUnsure(e) || e.startsWith('[')) return e;
	const one = (p: string) => (p === '..' || p === '' || /X/.test(p) || /[?%]$/.test(p) ? p : p.endsWith('~') ? p.slice(0, -1) + '%' : p + '?');
	return e.split('/').map(one).join('/');
}

/** Sources disagree: one of several dates. */
export const datesDisagree = (e: string | null | undefined) => !!e?.startsWith('[');

/** Short form for tree cards: exact dates collapse to the year. */
export function yearOnly(e: string | null | undefined): string {
	if (!e || !edtfRange(e)) return '';
	const m = e.match(/^(\d{4})-\d{2}(-\d{2})?$/);
	return m ? m[1] : fmtDate(e);
}

function single(input: string): DateRange | null {
	let m: RegExpMatchArray | null;
	if ((m = input.match(/^\[(.+)\]$/))) {
		const parts = m[1]
			.split(/,|\.\./)
			.map((x) => single(x.trim()))
			.filter((x): x is DateRange => !!x);
		return parts.length
			? { start: Math.min(...parts.map((p) => p.start)), end: Math.max(...parts.map((p) => p.end)) }
			: null;
	}
	const fuzz = /[~%]/.test(input) ? 2 : input.includes('?') ? 1 : 0;
	const s = input.replace(/[~?%]/g, '');
	const y4 = s.slice(0, 4);
	if (/^\d{0,3}X+$/.test(y4) && y4.length === 4)
		return { start: +y4.replace(/X/g, '0'), end: +y4.replace(/X/g, '9') + 1 };
	if (!/^\d{4}$/.test(y4)) return null;
	const y = +y4;
	const mo = +s.slice(5, 7);
	if (mo >= 1 && mo <= 12) {
		const f = (mo - 1) / 12;
		return { start: y + f - fuzz, end: y + f + 1 / 12 + fuzz };
	}
	return { start: y - fuzz, end: y + 1 + fuzz };
}

/** Fractional-year range covered by an EDTF value, widened for approximate/uncertain dates. */
export function edtfRange(e: string | null | undefined): DateRange | null {
	if (!e) return null;
	if (e.includes('/')) {
		const [a, b] = e.split('/');
		const A = a === '..' || a === '' ? null : single(a);
		const B = b === '..' || b === '' ? null : single(b);
		if (!A && !B) return null;
		return { start: A ? A.start : B!.start - 10, end: B ? B.end : A!.end + 10, span: !!(A && B) };
	}
	const r = single(e);
	return r ? { ...r, span: false } : null;
}
