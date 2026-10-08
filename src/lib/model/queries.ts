// Read-only queries over a Dataset. All functions take the dataset explicitly so they are easy to test.
import type { Dataset, Family, LifeEvent, Name, Person } from './types.ts';
import { edtfRange, yearOnly } from './edtf.ts';

export const NOW = new Date().getFullYear() + new Date().getMonth() / 12;
/** People born longer ago than this are treated as probably deceased. */
export const PRESUMED_DEAD_AFTER = 110;

export const person = (d: Dataset, id: string | null | undefined) => d.people.find((p) => p.id === id);
export const family = (d: Dataset, id: string | null | undefined) => d.families.find((f) => f.id === id);
export const partnerIds = (f: Family) => (f.partners ?? []).map((x) => x.personId);
export const childIds = (f: Family) => (f.children ?? []).map((x) => x.personId);
export const famsAsPartner = (d: Dataset, id: string) => d.families.filter((f) => partnerIds(f).includes(id));
export const famAsChild = (d: Dataset, id: string) => d.families.find((f) => childIds(f).includes(id));
/** The family where `id` is the only recorded parent ("+ unknown other parent"). */
export const soloFam = (d: Dataset, id: string) =>
	d.families.find((f) => {
		const ps = partnerIds(f);
		return ps.length === 1 && ps[0] === id;
	});
export const coupleFam = (d: Dataset, a: string, b: string) =>
	d.families.find((f) => {
		const ps = partnerIds(f);
		return ps.length === 2 && ps.includes(a) && ps.includes(b);
	});

/** The person's main name: the preferred one, else the first. */
export const primaryName = (p: Person | undefined): Name | undefined =>
	p?.names?.find((n) => n.preferred) ?? p?.names?.[0];

export function fullName(p: Person | undefined): string {
	const n = primaryName(p);
	if (!n) return 'Unnamed';
	return n.display || [n.given, n.surname].filter(Boolean).join(' ') || 'Unnamed';
}

/** Name shown on the tree: "known as" (plus surname if it's a single word), else the full name. */
export function displayName(p: Person | undefined): string {
	if (!p) return 'Unknown';
	const k = p.knownAs?.trim();
	if (k) {
		const sn = primaryName(p)?.surname;
		return k.includes(' ') || !sn ? k : `${k} ${sn}`;
	}
	return fullName(p);
}

export const nameIsGuess = (p: Person) => !!p.placeholder || !primaryName(p) || primaryName(p)!.status === 'guess';

export const placeName = (d: Dataset, id: string | undefined) => d.places.find((p) => p.id === id)?.name ?? '';

/** Birth (or baptism) / death (or burial) event where the person is the principal. */
export function lifeEvent(d: Dataset, pid: string, kind: 'birth' | 'death'): LifeEvent | undefined {
	const types = kind === 'birth' ? ['birth', 'baptism'] : ['death', 'burial'];
	for (const t of types) {
		const e = d.events.find(
			(e) => e.type === t && e.participants.some((x) => x.personId === pid && (x.role ?? 'principal') === 'principal')
		);
		if (e) return e;
	}
}

export const birthStart = (d: Dataset, id: string) => edtfRange(lifeEvent(d, id, 'birth')?.date?.edtf)?.start ?? 9999;

/** Ordering for partners in a couple: male left, female right, unknown in between. */
export const sexRank = (d: Dataset, id: string) => ({ M: 0, U: 1, F: 2 })[person(d, id)?.sex?.value ?? 'U'] ?? 1;

export function isLiving(d: Dataset, p: Person): boolean {
	if (p.deceased || lifeEvent(d, p.id, 'death')) return false;
	const b = edtfRange(lifeEvent(d, p.id, 'birth')?.date?.edtf);
	return !b || b.start > NOW - PRESUMED_DEAD_AFTER;
}

export function famLabel(d: Dataset, f: Family): string {
	const ps = partnerIds(f);
	if (!ps.length) return 'Parents not recorded';
	return ps.map((id) => displayName(person(d, id))).join(' & ') + (ps.length === 1 ? ' + unknown other parent' : '');
}

/** Dates line for a tree card, e.g. "b. 1885", "c.1858 – 1919?", "no dates yet". */
export function cardDates(d: Dataset, id: string): string {
	const p = person(d, id);
	const b = lifeEvent(d, id, 'birth'),
		x = lifeEvent(d, id, 'death');
	const by = yearOnly(b?.date?.edtf),
		dy = yearOnly(x?.date?.edtf);
	if (p?.deceased || x) return by || dy ? `${by || '?'} – ${dy || '?'}` : 'deceased';
	return by ? `b. ${by}` : 'no dates yet';
}

/** Children of the parents' other families. */
export function halfSiblings(d: Dataset, pid: string): string[] {
	const pf = famAsChild(d, pid);
	if (!pf) return [];
	return [...new Set(partnerIds(pf).flatMap((par) => famsAsPartner(d, par).filter((g) => g !== pf).flatMap(childIds)))];
}

/** Groups of people connected by any family link (unjoined branches). */
export function components(d: Dataset): string[][] {
	const adj = new Map(d.people.map((p) => [p.id, new Set<string>()]));
	for (const f of d.families) {
		const m = [...partnerIds(f), ...childIds(f)].filter((id) => adj.has(id));
		m.forEach((a) => m.forEach((b) => a !== b && adj.get(a)!.add(b)));
	}
	const seen = new Set<string>(),
		comps: string[][] = [];
	for (const p of d.people) {
		if (seen.has(p.id)) continue;
		const st = [p.id],
			c: string[] = [];
		while (st.length) {
			const n = st.pop()!;
			if (seen.has(n)) continue;
			seen.add(n);
			c.push(n);
			st.push(...adj.get(n)!);
		}
		comps.push(c);
	}
	return comps.sort((a, b) => b.length - a.length);
}

// ---- search ----

export interface SearchHit {
	id: string;
	/** Another name that matched when the shown name didn't, e.g. a maiden name ("Mary Walker"). */
	alsoKnownAs?: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = (s: string) => fold(s).split(/[\s\-'’.,()]+/).filter(Boolean);
const nameText = (n: Name) => n.display || [n.given, n.surname].filter(Boolean).join(' ');

/** How well one query word matches a list of name words: whole word 3, start of a word 2, anywhere 1, none 0. */
function wordScore(q: string, ws: string[]): number {
	if (ws.includes(q)) return 3;
	if (ws.some((w) => w.startsWith(q))) return 2;
	return ws.some((w) => w.includes(q)) ? 1 : 0;
}

/**
 * People matching a typed name, best first. Every query word must match one of the person's names
 * (any name: birth, married, deed poll…, or "known as"); accents and case are ignored.
 * The name shown on the tree ranks above other names. An empty query lists everyone by name.
 */
export function searchPeople(d: Dataset, query: string, opts: { exclude?: string; limit?: number } = {}): SearchHit[] {
	const qs = words(query);
	const hits: (SearchHit & { score: number; label: string })[] = [];
	for (const p of d.people) {
		if (p.id === opts.exclude) continue;
		const label = displayName(p);
		const shown = words(`${label} ${fullName(p)}`);
		const others = (p.names ?? []).map(nameText).filter((t) => t && !fold(label).includes(fold(t)));
		let score = 0,
			also: string | undefined;
		for (const q of qs) {
			const s = wordScore(q, shown);
			if (s) {
				score += s + 0.5;
				continue;
			}
			const o = others.map((t) => ({ t, s: wordScore(q, words(t)) })).sort((a, b) => b.s - a.s)[0];
			if (!o?.s) {
				score = -1;
				break;
			}
			score += o.s;
			also ??= o.t;
		}
		if (score >= 0) hits.push({ id: p.id, alsoKnownAs: also, score, label });
	}
	hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
	return hits.slice(0, opts.limit ?? Infinity).map(({ id, alsoKnownAs }) => (alsoKnownAs ? { id, alsoKnownAs } : { id }));
}
