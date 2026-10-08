// @vitest-environment happy-dom
// Mutations run directly on the app's $state proxy, which plain-object tests don't exercise.
import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type { Dataset } from './types.ts';
import { emptyDataset, linkPeople, newPerson, setLife } from './mutations.ts';
import { childIds, famAsChild, lifeEvent, partnerIds } from './queries.ts';

describe('mutations on a $state proxy', () => {
	it('adding a child to someone with no family yet links them', () => {
		const d: Dataset = $state(emptyDataset());
		const ann = newPerson(d, 'Ann Smith').id;
		const kid = newPerson(d, 'Baby Smith').id;
		// The app's derived views (layout, autosave) read the whole dataset; do the same so the proxy is "live".
		const stop = $effect.root(() => {
			$effect(() => {
				JSON.stringify(d);
			});
		});
		flushSync();
		expect(linkPeople(d, 'child', ann, kid, { unsure: false, kids: [], famId: '' })).toEqual({});
		const f = famAsChild(d, kid);
		expect(f && partnerIds(f)).toEqual([ann]);
		expect(f && childIds(f)).toEqual([kid]);
		stop();
	});

	it('a new birth event keeps its date', () => {
		const d: Dataset = $state(emptyDataset());
		const id = newPerson(d, 'Ann').id;
		lifeEvent(d, id, 'birth'); // read first, as the UI does
		setLife(d, id, 'birth', '1880s', 'Leeds');
		expect(lifeEvent(d, id, 'birth')?.date?.edtf).toBe('188X');
		expect(JSON.parse(JSON.stringify(d)).events[0].date.edtf).toBe('188X');
	});
});
