import { describe, expect, it } from 'vitest';
import { edtfRange, fmtDate, parseUserDate, yearOnly } from './edtf.ts';

describe('parseUserDate', () => {
	it.each([
		['1858', '1858'],
		['c.1858', '1858~'],
		['circa 1858', '1858~'],
		['1880s', '188X'],
		['before 1901', '../1901'],
		['after 1901', '1901/..'],
		['1901-1911', '1901/1911'],
		['2/6/1883', '1883-06-02'],
		['', '']
	])('%s → %s', (input, out) => expect(parseUserDate(input)).toBe(out));
});

describe('fmtDate', () => {
	it.each([
		['1858~', 'c.1858'],
		['188X', '1880s'],
		['../1901', 'bef. 1901'],
		['1901/1911', '1901–1911'],
		['1885-03', 'Mar 1885'],
		['1883-06-02', '2 Jun 1883']
	])('%s → %s', (input, out) => expect(fmtDate(input)).toBe(out));

	it('round-trips user input', () => {
		for (const s of ['c.1858', '1880s', 'bef. 1901']) expect(fmtDate(parseUserDate(s))).toBe(s);
	});
});

describe('yearOnly', () => {
	it('collapses exact dates to the year', () => {
		expect(yearOnly('1885-03')).toBe('1885');
		expect(yearOnly('1883-06-02')).toBe('1883');
		expect(yearOnly('1858~')).toBe('c.1858');
	});
});

describe('edtfRange', () => {
	it('widens approximate and uncertain years', () => {
		expect(edtfRange('1858')).toMatchObject({ start: 1858, end: 1859 });
		expect(edtfRange('1858~')).toMatchObject({ start: 1856, end: 1861 });
		expect(edtfRange('1858?')).toMatchObject({ start: 1857, end: 1860 });
	});
	it('handles decades, intervals and open ends', () => {
		expect(edtfRange('188X')).toMatchObject({ start: 1880, end: 1890 });
		expect(edtfRange('1901/1911')).toMatchObject({ start: 1901, end: 1912, span: true });
		expect(edtfRange('../1901')).toMatchObject({ start: 1891, end: 1902, span: false });
	});
	it('returns null for unparseable input', () => {
		expect(edtfRange('sometime')).toBeNull();
		expect(edtfRange('')).toBeNull();
	});
});
