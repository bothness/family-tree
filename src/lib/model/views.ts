// Saved views (V5/V6): named filters stored in the dataset. A view stores a rule, never a copy of the people.
// One rule per view: a focus (root + up/down/width), everyone with a tag, or a hand-picked list.
import type { Dataset, View } from './types.ts';
import type { FocusOptions, FocusWidth } from './focus.ts';
import { displayName, person } from './queries.ts';
import { uid } from './mutations.ts';

export type ViewScope = NonNullable<View['scope']>;
export interface FocusRule extends FocusOptions {
	id: string;
}
export type ViewKind = 'focus' | 'tags' | 'people';

export const viewKind = (v: View): ViewKind => (v.scope?.root ? 'focus' : v.scope?.tags?.length ? 'tags' : 'people');

/** The focus a focus view describes (absent depths = all generations), or null for tag / hand-picked views. */
export function viewFocus(v: View): FocusRule | null {
	const s = v.scope;
	if (!s?.root) return null;
	return { id: s.root, up: s.up ?? Infinity, down: s.down ?? Infinity, width: s.width ?? 'direct' };
}

/** Store a focus as a view scope. Unlimited depths are left out, as the schema says. */
export function focusScope(f: FocusRule): ViewScope {
	const s: ViewScope = { root: f.id, width: f.width };
	if (isFinite(f.up)) s.up = f.up;
	if (isFinite(f.down)) s.down = f.down;
	return s;
}

export const sameFocus = (a: FocusRule | null, b: FocusRule | null) =>
	!!a && !!b && a.id === b.id && a.up === b.up && a.down === b.down && a.width === b.width;

/** People in a tag or hand-picked view (people who no longer exist are skipped). Focus views: use focusSet. */
export function viewMembers(d: Dataset, v: View): string[] {
	const s = v.scope ?? {};
	if (s.tags?.length) return d.people.filter((p) => p.tags?.some((t) => s.tags!.includes(t))).map((p) => p.id);
	return (s.people ?? []).filter((id) => person(d, id));
}

/** Every tag in use, alphabetically. */
export const allTags = (d: Dataset) => [...new Set(d.people.flatMap((p) => p.tags ?? []))].sort((a, b) => a.localeCompare(b));

const WIDTH_NAME: Record<FocusWidth, string> = { direct: 'direct line', siblings: 'with siblings', all: 'all relatives' };

/** A sensible default name for saving a focus. */
export function defaultViewName(d: Dataset, f: FocusRule): string {
	const who = displayName(person(d, f.id));
	if (f.width === 'direct' && f.up === 0 && f.down === Infinity) return `Descendants of ${who}`;
	if (f.width === 'direct' && f.up === Infinity && f.down === 0) return `Ancestors of ${who}`;
	return `${who}'s family`;
}

/** A user-facing description of what a view shows, e.g. "↑2 ↓1 · with siblings". */
export function describeView(d: Dataset, v: View): string {
	const f = viewFocus(v);
	if (f) {
		const n = (x: number) => (isFinite(x) ? `${x}` : 'all');
		return `${displayName(person(d, f.id))} · ↑${n(f.up)} ↓${n(f.down)} · ${WIDTH_NAME[f.width]}`;
	}
	const s = v.scope ?? {};
	return s.tags?.length ? `Everyone tagged ${s.tags.join(', ')}` : `${(s.people ?? []).length} people`;
}

// ---- changes (work directly on the $state proxy, like mutations.ts) ----

export function addView(d: Dataset, name: string, scope: ViewScope): View {
	d.views.push({ id: uid('view'), name: name.trim() || 'Untitled view', kind: 'tree', scope });
	return d.views.at(-1)!; // the stored (proxied) copy
}

export function setViewScope(d: Dataset, id: string, scope: ViewScope) {
	const v = d.views.find((v) => v.id === id);
	if (v) v.scope = scope;
}

export function renameView(d: Dataset, id: string, name: string) {
	const v = d.views.find((v) => v.id === id);
	if (v && name.trim()) v.name = name.trim();
}

export function deleteView(d: Dataset, id: string) {
	d.views = d.views.filter((v) => v.id !== id);
}
