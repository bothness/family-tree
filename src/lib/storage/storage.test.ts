// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDataset, newPerson } from '../model/mutations.ts';
import { indexedDbStore, LEGACY_KEY } from './index.ts';

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
