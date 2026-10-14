// Sources: anything that tells us about people, shared by everyone who cites it (like places). People only ever
// see "sources": a person's citations are shown as the source plus an optional note of what it tells us.
import type { Citation, Dataset, Source, SourceType } from './types.ts';
import { uid } from './mutations.ts';

export const SOURCE_TYPES: [SourceType, string][] = [
	['memory', 'Family memory'],
	['record', 'Record or certificate'],
	['papers', 'Family papers'],
	['book', 'Book or article'],
	['web', 'Web page'],
	['wikidata', 'Wikidata'],
	['other', 'Other']
];
export const sourceTypeLabel = (t: SourceType | undefined) => SOURCE_TYPES.find(([v]) => v === t)?.[1] ?? 'Other';

export const source = (d: Dataset, id: string | undefined) => d.sources.find((s) => s.id === id);

/** Sites whose pages are records (scans and transcriptions), and what to call them. */
const RECORD_SITES: [RegExp, string][] = [
	[/findmypast\./, 'Findmypast'],
	[/ancestry\./, 'Ancestry'],
	[/familysearch\.org/, 'FamilySearch'],
	[/freebmd\.org\.uk/, 'FreeBMD'],
	[/scotlandspeople\.gov\.uk/, 'ScotlandsPeople'],
	[/nationalarchives\.gov\.uk/, 'The National Archives'],
	[/irishgenealogy\.ie|census\.nationalarchives\.ie/, 'Irish records']
];
const WEB_SITES: [RegExp, string][] = [
	[/wikitree\.com/, 'WikiTree'],
	[/findagrave\.com/, 'Find a Grave'],
	[/thepeerage\.com/, 'thepeerage.com']
];

/** A new source from what was typed or pasted: a web address gives the type and a title from the site, a
 *  Wikidata id ("Q42") a Wikidata source; anything else is taken as a family memory. */
export function sourceFromText(text: string): Omit<Source, 'id'> {
	const t = text.trim();
	if (/^Q\d+$/i.test(t)) return { type: 'wikidata', title: `Wikidata ${t.toUpperCase()}`, url: `https://www.wikidata.org/wiki/${t.toUpperCase()}` };
	let u: URL | null = null;
	try {
		if (/^(https?:\/\/|www\.)\S+$/i.test(t)) u = new URL(/^www\./i.test(t) ? `https://${t}` : t);
	} catch {
		u = null;
	}
	if (!u) return { type: 'memory', title: t };
	const url = u.href,
		host = u.hostname.replace(/^www\./, '');
	const wd = host === 'wikidata.org' && u.pathname.match(/\/(Q\d+)$/);
	if (wd) return { type: 'wikidata', title: `Wikidata ${wd[1]}`, url };
	const wp = host.endsWith('wikipedia.org') && u.pathname.match(/^\/wiki\/(.+)$/);
	if (wp) return { type: 'web', title: `Wikipedia: ${decodeURIComponent(wp[1]).replace(/_/g, ' ')}`, url };
	// Some sites put who the page is about in the address (a page's own title can't be read from the browser).
	const wt = host.endsWith('wikitree.com') && u.pathname.match(/^\/wiki\/([^/]+-\d+)$/);
	if (wt) return { type: 'web', title: `WikiTree: ${decodeURIComponent(wt[1])}`, url };
	const fg = host.endsWith('findagrave.com') && u.pathname.match(/\/memorial\/\d+\/([^/]+)/);
	if (fg) return { type: 'web', title: `Find a Grave: ${fg[1].split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')}`, url };
	const rec = RECORD_SITES.find(([r]) => r.test(host));
	if (rec) return { type: 'record', title: rec[1], url };
	const web = WEB_SITES.find(([r]) => r.test(host));
	return { type: 'web', title: web?.[1] ?? host, url };
}

/** Everyone citing this source. */
export const sourceUsers = (d: Dataset, id: string) => d.people.filter((p) => p.citations?.some((c) => c.sourceId === id)).map((p) => p.id);

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Sources already in the tree matching what's typed (title words, or the web address), most used first. */
export function knownSources(d: Dataset, q: string, opts: { exclude?: string; limit?: number } = {}): { source: Source; uses: number }[] {
	const words = fold(q).split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const had = new Set(d.people.find((p) => p.id === opts.exclude)?.citations?.map((c) => c.sourceId));
	return d.sources
		.filter((s) => !had.has(s.id))
		.filter((s) => {
			const text = fold(`${s.title} ${s.url ?? ''}`);
			return words.every((w) => text.includes(w)) || (!!s.url && fold(q.trim()) === fold(s.url));
		})
		.map((source) => ({ source, uses: sourceUsers(d, source.id).length }))
		.sort((a, b) => b.uses - a.uses || a.source.title.localeCompare(b.source.title))
		.slice(0, opts.limit ?? 5);
}

/** Cite a source for a person: one already in the tree (by id), or a new one. Returns the source's id. */
export function cite(d: Dataset, pid: string, from: string | Omit<Source, 'id'>, detail?: string): string | null {
	const p = d.people.find((x) => x.id === pid);
	if (!p) return null;
	let id: string;
	if (typeof from === 'string') id = from;
	else {
		// The same web address is the same source.
		const same = from.url && d.sources.find((s) => s.url === from.url);
		id = same ? same.id : uid('src');
		if (!same) d.sources.push({ id, ...from });
	}
	if (p.citations?.some((c) => c.sourceId === id)) return id;
	const c: Citation = { sourceId: id };
	if (detail?.trim()) c.detail = detail.trim();
	// Push through the property, not the result of `??=`: in the app the data is reactive, and a push into the
	// plain array just assigned would be lost.
	p.citations ??= [];
	p.citations.push(c);
	return id;
}

/** Take a source off a person; it goes from the tree when no one cites it. */
export function uncite(d: Dataset, pid: string, sourceId: string) {
	const p = d.people.find((x) => x.id === pid);
	if (!p?.citations) return;
	p.citations = p.citations.filter((c) => c.sourceId !== sourceId);
	if (!p.citations.length) delete p.citations;
	pruneSources(d);
}

/** Every source id cited anywhere: people, and the per-fact citations the model allows on names, dates and links. */
export function citedSources(d: Dataset): Set<string> {
	const ids = new Set<string>();
	const walk = (o: unknown): void => {
		if (Array.isArray(o)) o.forEach(walk);
		else if (o && typeof o === 'object')
			for (const [k, v] of Object.entries(o)) {
				if (k === 'sourceId' && typeof v === 'string') ids.add(v);
				else walk(v);
			}
	};
	walk([d.people, d.families, d.events]);
	return ids;
}

/** Remove sources no one cites. */
export function pruneSources(d: Dataset) {
	const used = citedSources(d);
	if (d.sources.some((s) => !used.has(s.id))) d.sources = d.sources.filter((s) => used.has(s.id));
}
