// Keeping a browser-only tree safe (E5): browsers may clear site data (Chrome when the disk runs low, Safari after
// about a week of use without a visit), so ask for persistent storage, and remind people to download a backup.

/** Whether the browser has agreed to keep this site's data until the user clears it. */
export type Kept = 'yes' | 'no' | 'unsupported';

/** Ask the browser to keep our data (Firefox may show a prompt; Chrome and Safari decide quietly). */
export async function requestPersistence(): Promise<Kept> {
	const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
	if (!s?.persist || !s.persisted) return 'unsupported';
	try {
		if (await s.persisted()) return 'yes';
		return (await s.persist()) ? 'yes' : 'no';
	} catch {
		return 'no';
	}
}

/** How long changes can go without a backup before a reminder appears, and how long "not now" hides it. */
export const REMIND_AFTER = 3 * 24 * 3600e3,
	SNOOZE = 3 * 24 * 3600e3;

export interface BackupState {
	/** When the first change not in any backup was made (unset when everything is backed up). */
	unbackedSince?: number | null;
	/** Reminder hidden until then. */
	snoozedUntil?: number | null;
}

/** A backup reminder is due when changes have gone REMIND_AFTER without one, unless snoozed. */
export const backupDue = (s: BackupState, now: number) =>
	!!s.unbackedSince && now - s.unbackedSince >= REMIND_AFTER && now >= (s.snoozedUntil ?? 0);

/** "today", "yesterday", "3 days ago", or a date for anything older than a month. */
export function ago(t: number, now: number): string {
	const days = Math.floor((now - t) / (24 * 3600e3));
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 31) return `${days} days ago`;
	return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
