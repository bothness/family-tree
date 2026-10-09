import { describe, expect, it } from 'vitest';
import demo from '../data/demo-darwin.json';
import { migrate } from '../model/migrate.ts';
import { emptyDataset } from '../model/mutations.ts';
import type { Dataset } from '../model/types.ts';
import { gedcomDate, toGedcom } from './gedcom.ts';

/** GEDCOM well-formedness: line syntax, levels, line length, and that every @X@ pointer has a record. */
function problems(ged: string): string[] {
	const out: string[] = [];
	const lines = ged.replace(/^﻿/, '').split('\r\n').filter((l) => l !== '');
	const defined = new Set<string>();
	const used: string[] = [];
	let prev = -1;
	for (const l of lines) {
		const m = l.match(/^(\d+) (?:(@[A-Z0-9]+@) )?([A-Z_][A-Z0-9_]*)(?: (.*))?$/);
		if (!m) {
			out.push(`bad line: ${l}`);
			continue;
		}
		const lvl = +m[1];
		if (lvl > prev + 1) out.push(`level jumps: ${l}`);
		prev = lvl;
		if (l.length > 255) out.push(`too long: ${l.slice(0, 40)}…`);
		if (m[2]) defined.add(m[2]);
		if (m[4] && /^@[A-Z0-9]+@$/.test(m[4])) used.push(m[4]);
	}
	for (const u of used) if (!defined.has(u)) out.push(`no record for ${u}`);
	if (!lines[0].startsWith('0 HEAD') || lines.at(-1) !== '0 TRLR') out.push('missing HEAD or TRLR');
	return out;
}

describe('gedcomDate', () => {
	it('converts exact, approximate and uncertain dates', () => {
		expect(gedcomDate('1809-02-12')).toBe('12 FEB 1809');
		expect(gedcomDate('1960-08')).toBe('AUG 1960');
		expect(gedcomDate('1858')).toBe('1858');
		expect(gedcomDate('1858~')).toBe('ABT 1858');
		expect(gedcomDate('1919?')).toBe('EST 1919');
	});
	it('converts decades, before/after and ranges', () => {
		expect(gedcomDate('188X')).toBe('BET 1880 AND 1889');
		expect(gedcomDate('18XX')).toBe('BET 1800 AND 1899');
		expect(gedcomDate('../1901')).toBe('BEF 1901');
		expect(gedcomDate('1901/..')).toBe('AFT 1901');
		expect(gedcomDate('1901/1911')).toBe('BET 1901 AND 1911');
	});
	it('keeps anything else as a date phrase', () => {
		expect(gedcomDate('spring, probably')).toBe('(spring, probably)');
	});
});

describe('toGedcom', () => {
	const d: Dataset = emptyDataset();
	d.people.push(
		{ id: 'per_john', names: [{ type: 'birth', given: 'John', surname: 'Smith', status: 'confirmed' }], sex: { value: 'M' }, deceased: true, knownAs: 'Jack', notes: 'Cooper.\nLived in Leeds.', research: { stage: 'in-progress', todo: ['Find baptism'] } },
		{ id: 'per_mary', names: [{ type: 'birth', given: 'Mary', surname: 'Walker', status: 'likely' }, { type: 'married', given: 'Mary', surname: 'Smith' }], sex: { value: 'F' } },
		{ id: 'per_ann', names: [{ given: 'Ann', surname: 'Smith' }], sex: { value: 'F' }, sourceNotes: 'x'.repeat(450) }
	);
	d.places.push({ id: 'plc_leeds', name: 'Leeds', context: 'West Yorkshire, England', coordinates: { lat: 53.8, lon: -1.55 } });
	d.events.push(
		{ id: 'e1', type: 'birth', date: { edtf: '1858~', status: 'likely' }, place: { placeId: 'plc_leeds' }, participants: [{ personId: 'per_john' }] },
		{ id: 'e2', type: 'death', date: { edtf: '1919?', status: 'guess' }, participants: [{ personId: 'per_mary' }] }
	);
	d.families.push({
		id: 'fam_1',
		partners: [{ personId: 'per_mary', status: 'confirmed' }, { personId: 'per_john', status: 'confirmed' }],
		relationship: { type: 'marriage', status: 'confirmed', start: { edtf: '1883-06-02', status: 'confirmed' } },
		children: [{ personId: 'per_ann', relation: 'biological', status: 'likely' }],
		childrenComplete: 'no',
		expectedChildren: { min: 4, note: '1911 census: 4 born alive' }
	});
	const ged = toGedcom(d, { now: new Date(2026, 9, 9) });
	const lines = ged.split('\r\n');

	it('is well-formed GEDCOM 5.5.1', () => {
		expect(problems(ged)).toEqual([]);
		expect(ged).toContain('2 VERS 5.5.1');
		expect(ged).toContain('1 CHAR UTF-8');
		expect(ged).toContain('1 DATE 9 OCT 2026');
	});
	it('writes names, nickname, sex, dates and places with coordinates', () => {
		expect(lines).toContain('1 NAME John /Smith/');
		expect(lines).toContain('2 NICK Jack');
		expect(lines).toContain('2 DATE ABT 1858');
		expect(lines).toContain('2 PLAC Leeds, West Yorkshire, England');
		expect(lines).toContain('4 LATI N53.8');
		expect(lines).toContain('4 LONG W1.55');
		expect(lines).toContain('1 NAME Mary /Smith/');
		expect(lines).toContain('2 TYPE married');
	});
	it('marks a death with no details as Y, and keeps notes on several lines', () => {
		expect(lines).toContain('1 DEAT Y');
		expect(lines).toContain('1 NOTE Cooper.');
		expect(lines).toContain('2 CONT Lived in Leeds.');
		expect(lines.some((l) => l.startsWith('2 CONC xxx'))).toBe(true);
	});
	it('puts the man as husband whatever the stored order, with children and the marriage', () => {
		const fam = ged.slice(ged.indexOf('@F1@ FAM'));
		expect(fam).toMatch(/1 HUSB @I1@\r\n1 WIFE @I2@\r\n1 CHIL @I3@/);
		expect(fam).toContain('1 MARR\r\n2 DATE 2 JUN 1883');
		expect(fam).toContain('1 NCHI 4');
		expect(fam).toContain('Children: 1911 census: 4 born alive');
	});
	it('keeps certainty as _STATUS tags and a readable note', () => {
		expect(ged).toContain('2 _STATUS likely');
		expect(ged).toContain('2 DATE ABT 1858\r\n3 _STATUS likely');
		expect(ged).toMatch(/Certainty \(from Family Tree Builder\): name: likely; death date: a guess/);
		expect(ged).toMatch(/1 FAMC @F1@\r\n2 PEDI birth\r\n2 _STATUS likely/);
		expect(ged).toContain('Research: in progress.');
		expect(ged).toContain('2 CONT - Find baptism');
	});
	it('links photos only when told where their files are', () => {
		const withPhoto = structuredClone(d);
		withPhoto.people[0].photo = 'media_1';
		expect(toGedcom(withPhoto)).not.toContain('OBJE');
		expect(toGedcom(withPhoto, { photoPath: (id) => `photos/${id}.jpg` })).toContain('1 OBJE\r\n2 FILE photos/media_1.jpg\r\n3 FORM jpg');
	});
	it('exports the whole demo family cleanly', () => {
		const dd = migrate(structuredClone(demo) as unknown as Dataset);
		const g = toGedcom(dd);
		expect(problems(g)).toEqual([]);
		expect(g.match(/^0 @I\d+@ INDI/gm)?.length).toBe(dd.people.length);
		expect(g.match(/^0 @F\d+@ FAM/gm)?.length).toBe(dd.families.length);
		expect(g).toContain('2 DATE 12 FEB 1809');
	});
});
