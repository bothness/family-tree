import { describe, expect, it } from 'vitest';
import type { Person } from './types.ts';
import { birthNameNote, displayName, fullName, nameIsGuess, primaryName, shownName } from './queries.ts';

const mary: Person = {
	id: 'mary',
	names: [
		{ type: 'birth', given: 'Mary', surname: 'Walker', status: 'guess' },
		{ type: 'married', given: 'Mary', surname: 'Smith', status: 'likely', preferred: true }
	]
};
const polly: Person = { id: 'polly', names: [{ type: 'birth', given: 'Mary', surname: 'Howard' }, { type: 'married', given: 'Mary', surname: 'Darwin' }], knownAs: 'Polly' };

describe('names', () => {
	it('keeps the birth name as the main name, and shows the one marked for the tree', () => {
		expect(primaryName(mary)?.surname).toBe('Walker');
		expect(shownName(mary)?.surname).toBe('Smith');
		expect(displayName(mary)).toBe('Mary Smith');
		expect(fullName(mary)).toBe('Mary Smith');
	});

	it('shows the main name when none is marked, with a one-word "known as" taking its surname', () => {
		expect(shownName(polly)).toBe(primaryName(polly));
		expect(displayName(polly)).toBe('Polly Howard');
		expect(displayName({ ...polly, knownAs: 'Sir Polly' })).toBe('Sir Polly');
	});

	it('a one-word "known as" takes the surname of the name shown', () => {
		expect(displayName({ ...mary, knownAs: 'Molly' })).toBe('Molly Smith');
	});

	it('notes the birth name under a different shown name', () => {
		expect(birthNameNote(mary)).toBe('born Mary Walker');
		expect(birthNameNote(polly)).toBe('Mary Howard');
		expect(birthNameNote({ id: 'x', names: [{ given: 'Ann', surname: 'Smith' }] })).toBeUndefined();
	});

	it('pencils the name by the certainty of the name shown', () => {
		expect(nameIsGuess(mary)).toBe(false);
		expect(nameIsGuess({ ...mary, names: [mary.names![0], { ...mary.names![1], preferred: false }] })).toBe(true);
	});
});
