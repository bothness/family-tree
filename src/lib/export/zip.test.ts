// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { emptyDataset, newPerson } from '../model/mutations.ts';
import { setPhoto } from '../model/media.ts';
import { indexedDbStore } from '../storage/index.ts';
import { isZip, makeZip, photoFileName, readZip } from './zip.ts';

let n = 0;
const store = () => indexedDbStore(`zip-test-${n++}`);

describe('ZIP export', () => {
	it('names photo files after the person, keeping the id', () => {
		expect(photoFileName('Charles Darwin', 'media_1')).toBe('photos/Charles-Darwin-media_1.jpg');
		expect(photoFileName('Zoë O’Brien', 'media_2', 'image/png')).toBe('photos/Zoe-O-Brien-media_2.png');
		expect(photoFileName('', 'media_3')).toBe('photos/media_3.jpg');
	});

	it('holds the data, a GEDCOM file and the photos, and opens again', async () => {
		const d = emptyDataset();
		const p = newPerson(d, 'Annie Darwin');
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
		const a = store();
		await a.putMedia('media_1', new Blob([jpeg], { type: 'image/jpeg' }));
		setPhoto(d, p.id, { mime: 'image/jpeg', width: 10, height: 10, thumb: 'data:image/jpeg;base64,AA==' }, 'media_1');

		const zip = await makeZip(a, d, new Date(2026, 9, 9));
		expect(isZip(zip)).toBe(true);
		const files = unzipSync(zip);
		expect(Object.keys(files).sort()).toEqual(['README.txt', 'family-tree.ged', 'family-tree.json', 'photos/Annie-Darwin-media_1.jpg']);
		expect(JSON.parse(strFromU8(files['family-tree.json'])).mediaFiles).toEqual({ media_1: 'photos/Annie-Darwin-media_1.jpg' });
		expect(strFromU8(files['family-tree.ged'])).toContain('2 FILE photos/Annie-Darwin-media_1.jpg');

		const b = store();
		const back = await readZip(b, zip);
		expect(back.people[0].names?.[0].given).toBe('Annie');
		expect(back.media[0].id).toBe('media_1');
		expect('mediaFiles' in back).toBe(false);
		const photo = await b.getMedia('media_1');
		expect(new Uint8Array(await photo!.arrayBuffer())).toEqual(jpeg);
	});

	it('refuses a ZIP without the tree in it', async () => {
		const { zipSync, strToU8 } = await import('fflate');
		await expect(readZip(store(), zipSync({ 'other.txt': strToU8('hi') }))).rejects.toThrow(/family-tree.json/);
	});
});
