import { beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from './types.ts';
import { emptyDataset, newPerson } from './mutations.ts';
import { searchPeople } from './queries.ts';

let d: Dataset;
const ids = (q: string, opts?: Parameters<typeof searchPeople>[2]) => searchPeople(d, q, opts).map((h) => h.id);

beforeEach(() => {
	d = emptyDataset();
	d.people.push(
		{ id: 'mary', names: [{ type: 'married', given: 'Mary', surname: 'Smith', preferred: true }, { type: 'birth', given: 'Mary', surname: 'Walker' }] },
		{ id: 'ann', names: [{ given: 'Ann', surname: 'Smith' }], knownAs: 'Annie' },
		{ id: 'john', names: [{ given: 'John', surname: 'Smith' }] },
		{ id: 'johanna', names: [{ given: 'Johanna', surname: 'Brennan' }] },
		{ id: 'sean', names: [{ given: 'Seán', surname: 'Ó Murchú' }] },
		{ id: 'unk', placeholder: true, names: [{ display: 'Unknown Murphy' }] }
	);
});

describe('searchPeople', () => {
	it('lists everyone by shown name when the query is empty', () => {
		expect(ids('')).toEqual(['ann', 'johanna', 'john', 'mary', 'sean', 'unk']);
	});

	it('finds people by maiden or other names, and says which name matched', () => {
		expect(searchPeople(d, 'walker')).toEqual([{ id: 'mary', alsoKnownAs: 'Mary Walker' }]);
		expect(ids('mary walker')).toEqual(['mary']);
	});

	it('finds people by "known as"', () => {
		expect(ids('annie')).toEqual(['ann']);
		expect(ids('ann')[0]).toBe('ann');
	});

	it('needs every word to match', () => {
		expect(ids('john smith')).toEqual(['john']);
		expect(ids('john murphy')).toEqual([]);
	});

	it('ranks whole words above word starts above matches inside a word', () => {
		d.people.push({ id: 'jo', names: [{ given: 'Jo', surname: 'Hart' }] }, { id: 'ojo', names: [{ given: 'Bojo', surname: 'Hart' }] });
		expect(ids('jo')).toEqual(['jo', 'johanna', 'john', 'ojo']);
	});

	it('ranks the shown name above other names', () => {
		newPerson(d, 'Walker Brown');
		const [first, second] = searchPeople(d, 'walker');
		expect(first.alsoKnownAs).toBeUndefined();
		expect(second).toEqual({ id: 'mary', alsoKnownAs: 'Mary Walker' });
	});

	it('ignores accents and case', () => {
		expect(ids('sean o murchu')).toEqual(['sean']);
		expect(ids('SEÁN')).toEqual(['sean']);
	});

	it('finds placeholders by their display text', () => {
		expect(ids('murphy')).toEqual(['unk']);
	});

	it('can exclude a person and limit results', () => {
		expect(ids('smith', { exclude: 'john' })).toEqual(['ann', 'mary']);
		expect(ids('', { limit: 2 })).toHaveLength(2);
	});
});
