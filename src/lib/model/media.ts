// Photos in the dataset (V10): Media entries and person.photo. The image files themselves live in the store.
import type { Dataset, Media } from './types.ts';
import { person } from './queries.ts';
import { uid } from './mutations.ts';

export const mediaOf = (d: Dataset, id: string | undefined) => (id ? d.media.find((m) => m.id === id) : undefined);
export const photoOf = (d: Dataset, pid: string) => mediaOf(d, person(d, pid)?.photo);

/** Give someone a photo. Returns the new Media id, and the id of the photo it replaced (whose file can go). */
export function setPhoto(d: Dataset, pid: string, m: Omit<Media, 'id' | 'kind'>): { id: string; replaced?: string } {
	const p = person(d, pid);
	if (!p) throw new Error('No such person');
	const replaced = removePhoto(d, pid);
	d.media.push({ id: uid('media'), kind: 'image', ...m });
	const id = d.media.at(-1)!.id;
	p.photo = id;
	return { id, ...(replaced ? { replaced } : {}) };
}

/** Take someone's photo away. Returns the Media id if nothing else uses it (so its file can be deleted). */
export function removePhoto(d: Dataset, pid: string): string | undefined {
	const p = person(d, pid);
	const id = p?.photo;
	if (!p || !id) return undefined;
	delete p.photo;
	if (d.people.some((q) => q.photo === id)) return undefined;
	d.media = d.media.filter((m) => m.id !== id);
	return id;
}

/** Media ids no one refers to any more (e.g. after deleting people). */
export const unusedMedia = (d: Dataset) => d.media.filter((m) => !d.people.some((p) => p.photo === m.id)).map((m) => m.id);
