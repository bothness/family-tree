import { beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from './types.ts';
import { deletePerson, emptyDataset, newPerson } from './mutations.ts';
import { photoOf, removePhoto, setPhoto, unusedMedia } from './media.ts';
import { fitWithin, halvings, squareCrop } from '../media/images.ts';

let d: Dataset;
let ann: string;
const pic = { mime: 'image/jpeg', width: 800, height: 600, thumb: 'data:image/jpeg;base64,AAAA' };
beforeEach(() => {
	d = emptyDataset();
	ann = newPerson(d, 'Ann Smith').id;
});

describe('photos in the dataset', () => {
	it('gives someone a photo', () => {
		const { id } = setPhoto(d, ann, pic);
		expect(photoOf(d, ann)).toMatchObject({ id, kind: 'image', mime: 'image/jpeg', width: 800 });
	});
	it('replacing a photo says which one to delete', () => {
		const first = setPhoto(d, ann, pic).id;
		const second = setPhoto(d, ann, pic);
		expect(second.replaced).toBe(first);
		expect(d.media.map((m) => m.id)).toEqual([second.id]);
	});
	it('removing a photo returns its id for the file to be deleted', () => {
		const { id } = setPhoto(d, ann, pic);
		expect(removePhoto(d, ann)).toBe(id);
		expect(photoOf(d, ann)).toBeUndefined();
		expect(d.media).toEqual([]);
	});
	it('deleting someone drops their photo entry', () => {
		setPhoto(d, ann, pic);
		deletePerson(d, ann);
		expect(d.media).toEqual([]);
		expect(unusedMedia(d)).toEqual([]);
	});
});

describe('image sizes', () => {
	it('fits within 800px without enlarging', () => {
		expect(fitWithin(4000, 3000)).toEqual({ w: 800, h: 600 });
		expect(fitWithin(300, 1200)).toEqual({ w: 200, h: 800 });
		expect(fitWithin(320, 240)).toEqual({ w: 320, h: 240 });
	});
	it('crops thumbnails square, nearer the top for portraits', () => {
		expect(squareCrop(400, 300)).toEqual({ x: 50, y: 0, side: 300 });
		expect(squareCrop(300, 500)).toEqual({ x: 0, y: 40, side: 300 });
	});

	it('shrinks by at most half per step, so downscaled photos stay smooth', () => {
		expect(halvings(8, 1)).toEqual([4, 2, 1]);
		expect(halvings(3, 1)).toEqual([1.5, 1]);
		expect(halvings(1.5, 1)).toEqual([1]);
		expect(halvings(1, 1)).toEqual([1]);
	});
});
