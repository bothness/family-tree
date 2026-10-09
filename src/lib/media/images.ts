// Photos (V10): only a resized copy is ever kept, never the original file. Resizing happens in the browser.

/** Longest side of the kept copy, and the size of the square card thumbnail. */
export const PHOTO_MAX = 800,
	THUMB = 96;

/** Size that fits within `max` on the longest side, never enlarging. */
export function fitWithin(w: number, h: number, max = PHOTO_MAX) {
	const k = Math.min(1, max / Math.max(w, h));
	return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The square to cut for a thumbnail: centred across, and nearer the top on portrait photos (where faces are). */
export function squareCrop(w: number, h: number) {
	const side = Math.min(w, h);
	return { x: (w - side) / 2, y: h > w ? (h - side) * 0.2 : 0, side };
}

export interface PreparedImage {
	image: Blob;
	mime: string;
	width: number;
	height: number;
	/** data: URL of the square thumbnail. */
	thumb: string;
}

/** Make the kept copy (JPEG, at most PHOTO_MAX) and the card thumbnail from a picked file. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
	const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
	const { w, h } = fitWithin(bmp.width, bmp.height);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
	const image = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't read that image."))), 'image/jpeg', 0.85));
	const t = document.createElement('canvas');
	t.width = t.height = THUMB;
	const s = squareCrop(bmp.width, bmp.height);
	t.getContext('2d')!.drawImage(bmp, s.x, s.y, s.side, s.side, 0, 0, THUMB, THUMB);
	const thumb = t.toDataURL('image/jpeg', 0.8);
	bmp.close();
	return { image, mime: 'image/jpeg', width: w, height: h, thumb };
}

/** For backups: a Blob as a data: URL, and back. */
export const blobToDataUrl = (b: Blob) =>
	new Promise<string>((ok, fail) => {
		const r = new FileReader();
		r.onload = () => ok(r.result as string);
		r.onerror = () => fail(r.error);
		r.readAsDataURL(b);
	});
export async function dataUrlToBlob(url: string): Promise<Blob> {
	const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
	if (!m) throw new Error('Not a data URL');
	const bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]));
	return new Blob([bytes], { type: m[1] ?? 'application/octet-stream' });
}
