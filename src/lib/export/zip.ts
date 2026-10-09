// ZIP export (E2): one file with everything, easy to look inside. It holds
// - family-tree.json: the dataset, like a backup, but with `mediaFiles` naming files in the ZIP instead of
//   holding the photos as data: URLs (so the app can open the ZIP again)
// - family-tree.ged: the same tree as GEDCOM 5.5.1 for other apps, with each photo linked by its path
// - photos/: the photos as JPEG files, named after the person
// - README.txt: what the files are
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Dataset } from '../model/types.ts';
import { displayName } from '../model/queries.ts';
import type { DataStore } from '../storage/index.ts';
import { readBackupData } from '../storage/index.ts';
import { toGedcom } from './gedcom.ts';

const README = `Family Tree Builder export

family-tree.json  The whole tree. Open it with Family Tree Builder (Data > Open backup file), or open this ZIP.
family-tree.ged   The tree as GEDCOM 5.5.1, for other family tree apps and sites. Some things don't carry over:
                  how sure each fact is, research notes and tags are kept as notes.
photos/           The photos, linked from both files.
`;

/** A file name for someone's photo: their name, then the photo's id (which keeps names unique). */
export function photoFileName(name: string, mediaId: string, mime = 'image/jpeg'): string {
	const slug = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	const ext = mime === 'image/png' ? 'png' : 'jpg';
	return `photos/${slug ? slug + '-' : ''}${mediaId}.${ext}`;
}

/** The ZIP export's bytes. */
export async function makeZip(store: DataStore, d: Dataset, now = new Date()): Promise<Uint8Array> {
	const files: Zippable = {};
	const paths: Record<string, string> = {};
	for (const m of d.media) {
		const b = await store.getMedia(m.id);
		if (!b) continue;
		const owner = d.people.find((p) => p.photo === m.id);
		const path = photoFileName(owner ? displayName(owner) : '', m.id, m.mime);
		paths[m.id] = path;
		// JPEGs are already compressed: store them as they are.
		files[path] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
	}
	files['family-tree.json'] = strToU8(JSON.stringify({ ...d, ...(Object.keys(paths).length ? { mediaFiles: paths } : {}) }, null, 2));
	files['family-tree.ged'] = strToU8(toGedcom(d, { now, photoPath: (id) => paths[id] }));
	files['README.txt'] = strToU8(README);
	return zipSync(files, { level: 6, mtime: now });
}

/** Is this file a ZIP (by its first bytes)? */
export const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** Open a ZIP export: puts its photos into the store and returns the dataset. */
export async function readZip(store: DataStore, bytes: Uint8Array): Promise<Dataset> {
	const files = unzipSync(bytes);
	const json = files['family-tree.json'];
	if (!json) throw new Error("there's no family-tree.json in that ZIP.");
	return readBackupData(store, JSON.parse(strFromU8(json)), async (path) => {
		const f = files[path];
		if (!f) return null;
		return new Blob([f.slice()], { type: path.endsWith('.png') ? 'image/png' : 'image/jpeg' });
	});
}
