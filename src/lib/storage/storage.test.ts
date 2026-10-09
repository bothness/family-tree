// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDataset, newPerson } from '../model/mutations.ts';
import { indexedDbStore, LEGACY_KEY, makeBackup, pruneMedia, readBackup } from './index.ts';

// Each test gets its own database (connections stay open, so deleting one between tests would block).
let n = 0;
let name = '';
beforeEach(() => {
	localStorage.clear();
	name = `family-tree-test-${n++}`;
});

describe('IndexedDB store', () => {
	it('saves and loads the dataset', async () => {
		const d = emptyDataset();
		newPerson(d, 'Ann Smith');
		const s = indexedDbStore(name);
		expect(await s.load()).toBeNull();
		await s.save(d);
		expect((await indexedDbStore(name).load())?.people[0].names?.[0]).toMatchObject({ given: 'Ann', surname: 'Smith' });
	});

	it('brings across data saved by the older localStorage version, leaving the original in place', async () => {
		const d = emptyDataset();
		newPerson(d, 'Old Data');
		localStorage.setItem(LEGACY_KEY, JSON.stringify(d));
		const loaded = await indexedDbStore(name).load();
		expect(loaded?.people[0].names?.[0].given).toBe('Old');
		localStorage.clear(); // now it comes from IndexedDB alone
		expect((await indexedDbStore(name).load())?.people[0].names?.[0].given).toBe('Old');
	});

	it('keeps photos (blobs) apart from the dataset', async () => {
		const s = indexedDbStore(name);
		await s.putMedia('media_1', new Blob(['abc'], { type: 'image/jpeg' }));
		const b = await s.getMedia('media_1');
		expect(b?.size).toBe(3);
		await s.deleteMedia('media_1');
		expect(await s.getMedia('media_1')).toBeNull();
	});
});

describe('backups', () => {
	it('include photo files, and loading one puts them back', async () => {
		const a = indexedDbStore(name);
		const d = emptyDataset();
		const ann = newPerson(d, 'Ann').id;
		d.media.push({ id: 'media_1', kind: 'image', mime: 'image/jpeg', thumb: 'data:image/jpeg;base64,AA==' });
		d.people.find((p) => p.id === ann)!.photo = 'media_1';
		await a.putMedia('media_1', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
		const text = await makeBackup(a, d);
		expect(JSON.parse(text).mediaFiles.media_1).toMatch(/^data:image\/jpeg;base64,/);

		const b = indexedDbStore(`${name}-other`);
		const back = await readBackup(b, text);
		expect(back.people[0].photo).toBe('media_1');
		expect('mediaFiles' in back).toBe(false);
		expect((await b.getMedia('media_1'))?.size).toBe(3);
	});

	it('prunes photo files nothing refers to', async () => {
		const s = indexedDbStore(name);
		await s.putMedia('media_keep', new Blob(['a']));
		await s.putMedia('media_gone', new Blob(['b']));
		const d = emptyDataset();
		d.media.push({ id: 'media_keep', kind: 'image', mime: 'image/jpeg' });
		await pruneMedia(s, d);
		expect(await s.listMedia()).toEqual(['media_keep']);
	});

	it('loads plain data without photos', async () => {
		const d = await readBackup(indexedDbStore(name), JSON.stringify(emptyDataset()));
		expect(d.media).toEqual([]);
	});
});
