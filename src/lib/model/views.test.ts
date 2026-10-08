import { beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from './types.ts';
import { deletePerson, emptyDataset } from './mutations.ts';
import { migrate } from './migrate.ts';
import { focusSet } from './focus.ts';
import { addView, defaultViewName, describeView, focusScope, sameFocus, viewFocus, viewKind, viewMembers } from './views.ts';

let d: Dataset;
beforeEach(() => {
	d = emptyDataset();
	d.people = [
		{ id: 'gp', names: [{ given: 'Gran' }] },
		{ id: 'par', names: [{ given: 'Pa' }], tags: ['smith'] },
		{ id: 'me', names: [{ given: 'Me' }], tags: ['smith', 'leeds'] },
		{ id: 'kid', names: [{ given: 'Kid' }] },
		{ id: 'other', names: [{ given: 'Other' }], tags: ['murphy'] }
	];
	d.families = [
		{ id: 'f1', partners: [{ personId: 'gp' }], children: [{ personId: 'par' }] },
		{ id: 'f2', partners: [{ personId: 'par' }], children: [{ personId: 'me' }] },
		{ id: 'f3', partners: [{ personId: 'me' }], children: [{ personId: 'kid' }] }
	];
});

describe('focus views', () => {
	it('round-trip a focus, leaving out unlimited depths', () => {
		const f = { id: 'me', up: Infinity, down: 1, width: 'siblings' as const };
		expect(focusScope(f)).toEqual({ root: 'me', width: 'siblings', down: 1 });
		const v = addView(d, 'Mine', focusScope(f));
		expect(viewKind(v)).toBe('focus');
		expect(sameFocus(viewFocus(v), f)).toBe(true);
	});

	it('"all generations" really reaches every ancestor and descendant', () => {
		const ids = focusSet(d, 'kid', { up: Infinity, down: Infinity, width: 'direct' }).ids;
		expect([...ids].sort()).toEqual(['gp', 'kid', 'me', 'par']);
	});

	it('names descendant and ancestor views after the person', () => {
		expect(defaultViewName(d, { id: 'gp', up: 0, down: Infinity, width: 'direct' })).toBe('Descendants of Gran');
		expect(defaultViewName(d, { id: 'kid', up: Infinity, down: 0, width: 'direct' })).toBe('Ancestors of Kid');
		expect(defaultViewName(d, { id: 'me', up: 2, down: 1, width: 'siblings' })).toBe("Me's family");
	});

	it('describes what a view shows', () => {
		const v = addView(d, 'x', focusScope({ id: 'me', up: 2, down: Infinity, width: 'all' }));
		expect(describeView(d, v)).toBe('Me · ↑2 ↓all · all relatives');
	});
});

describe('tag and hand-picked views', () => {
	it('tag views include everyone with any of the tags', () => {
		const v = addView(d, 'Smiths', { tags: ['smith'] });
		expect(viewKind(v)).toBe('tags');
		expect(viewMembers(d, v)).toEqual(['par', 'me']);
	});

	it('hand-picked views list their people, skipping anyone deleted', () => {
		const v = addView(d, 'Picked', { people: ['other', 'kid'] });
		expect(viewKind(v)).toBe('people');
		deletePerson(d, 'kid');
		expect(viewMembers(d, v)).toEqual(['other']);
		expect(v.scope?.people).toEqual(['other']);
	});

	it('deleting the person a focus view is centred on deletes the view', () => {
		addView(d, 'Mine', { root: 'me', up: 1, down: 1, width: 'direct' });
		deletePerson(d, 'me');
		expect(d.views).toEqual([]);
	});

	it('gives a blank name a placeholder', () => {
		expect(addView(d, '  ', { people: [] }).name).toBe('Untitled view');
	});
});

describe('migrating early view scopes', () => {
	const scopeAfter = (scope: object) => migrate({ ...emptyDataset(), views: [{ id: 'v', name: 'v', kind: 'tree', scope }] }).views[0].scope;

	it('turns direction + generations into up/down', () => {
		expect(scopeAfter({ root: 'me', direction: 'ancestors', generations: 3, includeSpouses: true })).toEqual({ root: 'me', up: 3, down: 0 });
		expect(scopeAfter({ root: 'me', direction: 'descendants' })).toEqual({ root: 'me', up: 0 });
		expect(scopeAfter({ root: 'me', direction: 'both', generations: 2 })).toEqual({ root: 'me', up: 2, down: 2 });
		expect(scopeAfter({ root: 'me', direction: 'connected' })).toEqual({ root: 'me', width: 'all' });
	});

	it('leaves new-style scopes alone', () => {
		expect(scopeAfter({ tags: ['smith'] })).toEqual({ tags: ['smith'] });
	});
});

describe('view ids', () => {
	it('match the schema pattern (view_…)', () => {
		expect(addView(emptyDataset(), 'x', { people: [] }).id).toMatch(/^view_[A-Za-z0-9_-]+$/);
	});
});
