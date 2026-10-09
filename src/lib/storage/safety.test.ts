import { describe, expect, it } from 'vitest';
import { REMIND_AFTER, SNOOZE, ago, backupDue } from './safety.ts';

const DAY = 24 * 3600e3;

describe('backup reminder', () => {
	const now = 100 * DAY;
	it('is not due when everything is backed up', () => {
		expect(backupDue({}, now)).toBe(false);
		expect(backupDue({ unbackedSince: null }, now)).toBe(false);
	});
	it('waits a few days after the first change that is not in a backup', () => {
		expect(backupDue({ unbackedSince: now - REMIND_AFTER + 1 }, now)).toBe(false);
		expect(backupDue({ unbackedSince: now - REMIND_AFTER }, now)).toBe(true);
	});
	it('stays hidden while snoozed', () => {
		const s = { unbackedSince: now - 10 * DAY, snoozedUntil: now + SNOOZE };
		expect(backupDue(s, now)).toBe(false);
		expect(backupDue(s, now + SNOOZE)).toBe(true);
	});
});

describe('ago', () => {
	const now = new Date(2026, 9, 9, 15).getTime();
	it('says how long ago in days, then gives a date', () => {
		expect(ago(now - 3600e3, now)).toBe('today');
		expect(ago(now - DAY, now)).toBe('yesterday');
		expect(ago(now - 5 * DAY, now)).toBe('5 days ago');
		expect(ago(now - 60 * DAY, now)).toMatch(/2026/);
	});
});
