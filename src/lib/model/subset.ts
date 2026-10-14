// Part of a tree, for exporting only the people in the current view (a focus or saved view).
import type { Dataset } from './types.ts';
import { prune } from './mutations.ts';

/** A copy of the data with only these people: their families (cut down to the people kept), their births and
 *  deaths, and the places, sources and photos those use. Saved views are left out (they're about the whole tree). */
export function subsetDataset(d: Dataset, ids: Iterable<string>): Dataset {
	const keep = new Set(ids);
	const out: Dataset = structuredClone({ ...d, views: [] });
	out.people = out.people.filter((p) => keep.has(p.id));
	for (const f of out.families) {
		f.partners = f.partners.filter((x) => keep.has(x.personId));
		f.children = f.children.filter((x) => keep.has(x.personId));
	}
	for (const e of out.events) e.participants = e.participants.filter((x) => keep.has(x.personId));
	out.events = out.events.filter((e) => e.participants.length);
	out.media = out.media.filter((m) => out.people.some((p) => p.photo === m.id));
	// Families that no longer say anything, then places and sources no one uses.
	prune(out);
	return out;
}
