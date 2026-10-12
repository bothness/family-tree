import { beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from './types.ts';
import { deletePerson, emptyDataset, setLife } from './mutations.ts';
import { cite, knownSources, sourceFromText, sourceUsers, uncite } from './sources.ts';
import { setLifePlace } from './places.ts';

let d: Dataset;
beforeEach(() => {
	d = emptyDataset();
	d.people.push({ id: 'john' }, { id: 'mary' }, { id: 'william' });
});

describe('sourceFromText', () => {
	it('takes the type and a title from a web address', () => {
		expect(sourceFromText('https://www.wikidata.org/wiki/Q1035')).toEqual({ type: 'wikidata', title: 'Wikidata Q1035', url: 'https://www.wikidata.org/wiki/Q1035' });
		expect(sourceFromText('https://en.wikipedia.org/wiki/Emma_Darwin')).toMatchObject({ type: 'web', title: 'Wikipedia: Emma Darwin' });
		expect(sourceFromText('https://www.findmypast.co.uk/transcript?id=GBC/1891/123')).toMatchObject({ type: 'record', title: 'Findmypast' });
		expect(sourceFromText('www.wikitree.com/wiki/Darwin-11')).toMatchObject({ type: 'web', title: 'WikiTree', url: 'https://www.wikitree.com/wiki/Darwin-11' });
		expect(sourceFromText('https://example.org/family/page')).toMatchObject({ type: 'web', title: 'example.org' });
	});

	it('reads a bare Wikidata id, and anything else as a family memory', () => {
		expect(sourceFromText('q42')).toMatchObject({ type: 'wikidata', url: 'https://www.wikidata.org/wiki/Q42' });
		expect(sourceFromText('Grandma confirmed this')).toEqual({ type: 'memory', title: 'Grandma confirmed this' });
	});
});

describe('citing sources', () => {
	it('shares one source between people, each with their own note', () => {
		const id = cite(d, 'john', { type: 'record', title: 'Marriage certificate, 1883' }, 'age 25, cooper')!;
		cite(d, 'mary', id);
		cite(d, 'william', id, "named as John's father");
		expect(d.sources).toHaveLength(1);
		expect(sourceUsers(d, id)).toEqual(['john', 'mary', 'william']);
		expect(d.people[2].citations).toEqual([{ sourceId: id, detail: "named as John's father" }]);
	});

	it('treats the same web address as the same source, and never cites one twice', () => {
		const a = cite(d, 'john', sourceFromText('https://en.wikipedia.org/wiki/Leeds'));
		const b = cite(d, 'mary', sourceFromText('https://en.wikipedia.org/wiki/Leeds'));
		cite(d, 'mary', b!);
		expect(a).toBe(b);
		expect(d.sources).toHaveLength(1);
		expect(d.people[1].citations).toHaveLength(1);
	});

	it('removes a source once no one cites it, including when someone is deleted', () => {
		const id = cite(d, 'john', { type: 'memory', title: 'Aunt Jean' })!;
		cite(d, 'mary', id);
		uncite(d, 'john', id);
		expect(d.sources).toHaveLength(1);
		expect(d.people[0].citations).toBeUndefined();
		deletePerson(d, 'mary');
		expect(d.sources).toEqual([]);
	});

	it('suggests sources already in the tree, most used first, leaving out ones already cited', () => {
		const census = cite(d, 'john', { type: 'record', title: '1891 census, Leeds' })!;
		cite(d, 'mary', census);
		cite(d, 'john', { type: 'record', title: '1881 census, Leeds' });
		expect(knownSources(d, 'census leeds', { exclude: 'william' }).map((x) => [x.source.title, x.uses])).toEqual([
			['1891 census, Leeds', 2],
			['1881 census, Leeds', 1]
		]);
		expect(knownSources(d, 'census', { exclude: 'mary' }).map((x) => x.source.title)).toEqual(['1881 census, Leeds']);
	});
});

describe('unused places', () => {
	it('go when no event uses them, keeping wider areas of places in use', () => {
		setLife(d, 'john', 'birth', '1858', 'Leeds');
		setLife(d, 'mary', 'birth', '1860', 'Bradford');
		d.places.push({ id: 'plc_yorks', name: 'Yorkshire' });
		d.places.find((x) => x.name === 'Leeds')!.parentId = 'plc_yorks';
		setLife(d, 'mary', 'birth', null, 'Leeds');
		expect(d.places.map((x) => x.name).sort()).toEqual(['Leeds', 'Yorkshire']);
		setLifePlace(d, 'john', 'birth', null);
		setLifePlace(d, 'mary', 'birth', null);
		expect(d.places).toEqual([]);
	});
});
