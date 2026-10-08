// EDTF (Extended Date/Time Format) helpers.
// Users type everyday forms ("c.1858", "1880s", "before 1901"); we store EDTF and derive ranges for display.

export interface DateRange { start: number; end: number; span?: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Convert a user-typed date into EDTF. Unrecognised input is returned unchanged. */
export function parseUserDate(input: string | null | undefined): string {
	const s = (input ?? '').trim();
	if (!s) return '';
	let m: RegExpMatchArray | null;
	if ((m = s.match(/^(c\.?|ca\.?|abt\.?|about|circa|~)\s*(\d{4})$/i))) return m[2] + '~';
	if ((m = s.match(/^(\d{3})0s$/))) return m[1] + 'X';
	if ((m = s.match(/^(bef\.?|before)\s*(\d{4})$/i))) return '../' + m[2];
	if ((m = s.match(/^(aft\.?|after)\s*(\d{4})$/i))) return m[2] + '/..';
	if ((m = s.match(/^(\d{4})\s*[–-]\s*(\d{4})$/))) return m[1] + '/' + m[2];
	if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)))
		return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
	return s;
}

/** Human-readable form of an EDTF string. */
export function fmtDate(e: string | null | undefined): string {
	if (!e) return '';
	let m: RegExpMatchArray | null;
	if ((m = e.match(/^(\d{4})~$/))) return 'c.' + m[1];
	if ((m = e.match(/^(\d{3})X$/))) return m[1] + '0s';
	if ((m = e.match(/^\.\.\/(.+)$/))) return 'bef. ' + m[1];
	if ((m = e.match(/^(.+)\/\.\.$/))) return 'aft. ' + m[1];
	if ((m = e.match(/^(\d{4}[^/]*)\/(\d{4}.*)$/))) return m[1] + '–' + m[2];
	if ((m = e.match(/^(\d{4})-(\d{2})$/))) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
	if ((m = e.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
	return e;
}

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
