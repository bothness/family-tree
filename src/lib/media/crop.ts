// Cropping a photo to a square (the crop dialog): the photo is shown behind a square frame of side `view` pixels,
// scaled by `zoom` from "just covers the frame" (1) up to MAX_ZOOM, and moved by dragging. The offset is where the
// photo's top-left corner sits in the frame; it's always kept so the photo covers the whole frame.

export const MAX_ZOOM = 4;

export interface Crop {
	/** Photo size, in its own pixels. */
	w: number;
	h: number;
	/** Frame side, in screen pixels. */
	view: number;
	/** 1 = the photo just covers the frame. */
	zoom: number;
	/** Where the photo's top-left corner is, in frame pixels (zero or negative). */
	x: number;
	y: number;
}

/** Screen pixels per photo pixel. */
export const scaleOf = (c: Crop) => (c.view / Math.min(c.w, c.h)) * c.zoom;

/** Keep the zoom in range and the photo covering the frame. */
export function clamp(c: Crop): Crop {
	const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
	const s = (c.view / Math.min(c.w, c.h)) * zoom;
	const x = Math.min(0, Math.max(c.view - c.w * s, c.x)),
		y = Math.min(0, Math.max(c.view - c.h * s, c.y));
	return { ...c, zoom, x, y };
}

/** The starting crop: as large as fits, centred (for a portrait photo, nearer the top, where faces usually are). */
export function initial(w: number, h: number, view: number): Crop {
	const s = view / Math.min(w, h);
	return clamp({ w, h, view, zoom: 1, x: (view - w * s) / 2, y: h > w ? (view - h * s) * 0.2 : (view - h * s) / 2 });
}

/** Zoom to `zoom`, keeping the point (px, py) of the frame over the same spot of the photo. */
export function zoomTo(c: Crop, zoom: number, px = c.view / 2, py = c.view / 2): Crop {
	const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
	const k = z / c.zoom;
	return clamp({ ...c, zoom: z, x: px - (px - c.x) * k, y: py - (py - c.y) * k });
}

export const moveBy = (c: Crop, dx: number, dy: number): Crop => clamp({ ...c, x: c.x + dx, y: c.y + dy });

/** The square to cut from the photo, in its own pixels. */
export function cutOf(c: Crop): { x: number; y: number; side: number } {
	const s = scaleOf(c);
	const side = Math.min(c.view / s, c.w, c.h);
	return { x: Math.max(0, Math.min(c.w - side, -c.x / s)), y: Math.max(0, Math.min(c.h - side, -c.y / s)), side };
}
