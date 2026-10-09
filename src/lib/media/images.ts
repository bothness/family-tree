// Photos (V10): only a resized copy is ever kept, never the original file. Resizing happens in the browser.

/** Longest side of the kept copy, and the size of the square card thumbnail (twice its largest on-screen size,
 *  for sharp high-DPI screens). */
export const PHOTO_MAX = 800,
	THUMB = 192;

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

/** Halvings to go from `from` pixels down to `to` smoothly: browsers (Safari especially) sample only a few source
 *  pixels per output pixel in one big drawImage step, which looks jagged. Each step is at most half. */
export function halvings(from: number, to: number): number[] {
	const out: number[] = [];
	for (let s = from / 2; s > to; s /= 2) out.push(s);
	return [...out, to];
}

/** Draw a region of `src` at `w` × `h`, shrinking by halves so it stays smooth. */
function drawScaled(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
	let cur: CanvasImageSource = src,
		cx = sx,
		cy = sy,
		cw = sw,
		ch = sh;
	const steps = halvings(Math.max(sw / w, sh / h), 1).map((k) => [Math.max(w, Math.round(w * k)), Math.max(h, Math.round(h * k))]);
	let c!: HTMLCanvasElement;
	for (const [tw, th] of steps) {
		c = document.createElement('canvas');
		c.width = tw;
		c.height = th;
		const g = c.getContext('2d')!;
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = 'high';
		g.drawImage(cur, cx, cy, cw, ch, 0, 0, tw, th);
		[cur, cx, cy, cw, ch] = [c, 0, 0, tw, th];
	}
	return c;
}

const thumbOf = (src: CanvasImageSource, w: number, h: number) => {
	const s = squareCrop(w, h);
	return drawScaled(src, s.x, s.y, s.side, s.side, THUMB, THUMB).toDataURL('image/jpeg', 0.85);
};

/** Make the kept copy (JPEG, at most PHOTO_MAX) and the card thumbnail from a picked file. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
	const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
	const { w, h } = fitWithin(bmp.width, bmp.height);
	const c = drawScaled(bmp, 0, 0, bmp.width, bmp.height, w, h);
	const image = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't read that image."))), 'image/jpeg', 0.85));
	const thumb = thumbOf(bmp, bmp.width, bmp.height);
	bmp.close();
	return { image, mime: 'image/jpeg', width: w, height: h, thumb };
}

/** A new thumbnail from the kept copy, if `thumb` is smaller than THUMB (photos added before thumbnails got
 *  bigger). Undefined if it's fine already. */
export async function betterThumb(thumb: string, kept: Blob): Promise<string | undefined> {
	const old = await createImageBitmap(await dataUrlToBlob(thumb));
	const small = old.width < THUMB;
	old.close();
	if (!small) return undefined;
	const bmp = await createImageBitmap(kept);
	const t = thumbOf(bmp, bmp.width, bmp.height);
	bmp.close();
	return t;
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
