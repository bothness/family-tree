// Bring the app's live data up to date with merged changes in place, so what's on screen (an open person panel,
// a field being typed in) isn't rebuilt: objects stay the same objects, lists of things with ids keep each item.
import { eq } from './merge.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const KEYS = ['id', 'personId'] as const;
const keyOf = (l: unknown[]) => KEYS.find((k) => l.length > 0 && l.every((x) => isObj(x) && typeof x[k] === 'string'));

/** Make `target` equal to `source`, changing as little as possible. */
export function patch(target: Obj, source: Obj): void {
	for (const k of Object.keys(target)) if (!(k in source) || source[k] === undefined) delete target[k];
	for (const [k, s] of Object.entries(source)) {
		if (s === undefined) continue;
		const t = target[k];
		if (eq(t, s)) continue;
		if (isObj(t) && isObj(s)) patch(t, s);
		else if (Array.isArray(t) && Array.isArray(s)) patchList(t, s);
		else target[k] = structuredClone(s);
	}
}

function patchList(t: unknown[], s: unknown[]) {
	const key = keyOf(s);
	if (key && (t.length === 0 || keyOf(t) === key)) {
		const old = new Map(t.map((x) => [(x as Obj)[key] as string, x as Obj]));
		const next = s.map((x) => {
			const o = old.get((x as Obj)[key] as string);
			if (!o) return structuredClone(x);
			patch(o, x as Obj);
			return o;
		});
		t.splice(0, t.length, ...next);
		return;
	}
	t.splice(0, t.length, ...structuredClone(s));
}
