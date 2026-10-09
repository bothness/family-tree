// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import demo from '../data/demo-darwin.json';
import type { Dataset } from '../model/types.ts';
import { eq, normalise } from './merge.ts';
import { patch } from './patch.ts';

describe('patch', () => {
	it('makes the target equal to the source', () => {
		const t = normalise(demo),
			s = normalise(demo);
		s.people[0].notes = 'changed';
		s.people.splice(3, 1);
		s.people.push({ id: 'per_new', names: [{ given: 'New' }] });
		delete s.people[1].knownAs;
		patch(t as never, s as never);
		expect(eq(t, s)).toBe(true);
	});

	it('keeps the same objects for people and families that are still there', () => {
		const t = normalise(demo),
			s = normalise(demo);
		const annie = t.people.find((p) => p.id === 'per_annie')!,
			george = t.people.find((p) => p.id === 'per_george')!,
			fam = t.families[0];
		s.people.find((p) => p.id === 'per_annie')!.notes = 'changed';
		s.people.reverse();
		patch(t as never, s as never);
		expect(t.people.find((p) => p.id === 'per_annie')).toBe(annie);
		expect(t.people.find((p) => p.id === 'per_george')).toBe(george);
		expect(t.families[0]).toBe(fam);
		expect(annie.notes).toBe('changed');
	});

	it('works on Svelte state (the app data), keeping its objects', () => {
		const state = $state(normalise(demo));
		const first = state.people[0];
		const s: Dataset = normalise(demo);
		s.people[0].notes = 'from the other device';
		patch(state as never, s as never);
		expect(state.people[0].notes).toBe('from the other device');
		expect(state.people[0]).toBe(first);
		expect(eq($state.snapshot(state), s)).toBe(true);
	});
});
