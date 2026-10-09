// Pan and zoom maths for the tree canvas (V1). Pure functions; the component only feeds in sizes and input.
// A camera maps world (layout) coordinates to screen coordinates: screen = world * k + (x, y).

export interface Camera { x: number; y: number; k: number }
export interface Box { x: number; y: number; w: number; h: number }

export const MIN_K = 0.1, MAX_K = 2.5;
/** Fit never zooms a small tree in past 100%: cards stay their natural size. */
export const FIT_MAX_K = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Camera that shows the whole box, centred, with `pad` screen pixels around it. */
export function fit(b: Box, vw: number, vh: number, pad = 32, maxK = FIT_MAX_K): Camera {
	const k = clamp(Math.min((vw - 2 * pad) / Math.max(b.w, 1), (vh - 2 * pad) / Math.max(b.h, 1)), MIN_K, maxK);
	return { k, x: vw / 2 - (b.x + b.w / 2) * k, y: vh / 2 - (b.y + b.h / 2) * k };
}

/** Zoom by `factor`, keeping the world point under screen point (sx, sy) where it is. */
export function zoomAt(c: Camera, factor: number, sx: number, sy: number): Camera {
	const k = clamp(c.k * factor, MIN_K, MAX_K),
		f = k / c.k;
	return { k, x: sx - (sx - c.x) * f, y: sy - (sy - c.y) * f };
}

export const panBy = (c: Camera, dx: number, dy: number): Camera => ({ ...c, x: c.x + dx, y: c.y + dy });

/** Move (without zooming) so world point (wx, wy) is in the middle of the viewport. */
export const centreOn = (c: Camera, wx: number, wy: number, vw: number, vh: number): Camera => ({ k: c.k, x: vw / 2 - wx * c.k, y: vh / 2 - wy * c.k });

/** Pan as little as possible so the world box is on screen with `margin` pixels to spare. Same camera if it already is. */
export function ensureVisible(c: Camera, b: Box, vw: number, vh: number, margin = 24): Camera {
	const shift = (lo: number, hi: number, size: number) => {
		if (hi - lo > size - 2 * margin) return margin - lo; // too big: show its start
		if (lo < margin) return margin - lo;
		if (hi > size - margin) return size - margin - hi;
		return 0;
	};
	const dx = shift(b.x * c.k + c.x, (b.x + b.w) * c.k + c.x, vw),
		dy = shift(b.y * c.k + c.y, (b.y + b.h) * c.k + c.y, vh);
	return dx || dy ? panBy(c, dx, dy) : c;
}

/** The parts of a WheelEvent we look at (plain object, so it can be tested). */
export interface WheelLike {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	ctrlKey: boolean;
	metaKey: boolean;
	/** Non-standard, but present in Chrome and Safari; helps tell a mouse wheel from a trackpad. */
	wheelDeltaY?: number;
}

const LINE_PX = 33, PAGE_PX = 800;
/** Zoom per Safari mouse-wheel notch (about the same as one 100px Chrome notch). */
const SAFARI_NOTCH = 0.2;

/**
 * What a wheel event should do. Browsers don't say whether it came from a mouse or a trackpad, so this guesses:
 * - ⌘/Ctrl + scroll, and trackpad pinch (which browsers report as Ctrl + wheel): zoom
 * - mouse wheel: zoom. Recognised by line/page steps (Firefox), notches of 120 in `wheelDeltaY`, a `wheelDeltaY`
 *   that isn't the trackpad's exact -3 × deltaY (Chrome), or Safari's tell-tale fraction (see below)
 * - anything else (trackpad two-finger scroll, sideways scroll): pan
 * Returns the zoom factor, or the pan offset in screen pixels.
 */
export function wheelAction(e: WheelLike): { zoom: number } | { pan: [number, number] } {
	const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
	const dx = e.deltaX * unit,
		dy = e.deltaY * unit;
	if (e.ctrlKey || e.metaKey) return { zoom: Math.exp(-dy * 0.01) };
	if (e.deltaX !== 0 || e.deltaY === 0) return { pan: [-dx, -dy] };
	// Safari: a mouse-wheel notch is a small step plus 1/4096 (e.g. 4.000244140625, wheelDeltaY -12), while a
	// trackpad scrolls in whole numbers (e.g. -1, wheelDeltaY 3). Each such notch is one standard zoom step.
	const frac = Math.abs(e.deltaY) % 1;
	if (e.deltaMode === 0 && frac > 0 && frac < 0.001) return { zoom: Math.exp(-Math.sign(dy) * SAFARI_NOTCH) };
	// Trackpads report wheelDeltaY ≈ -3 × deltaY (an integer, so allow rounding when deltaY is fractional).
	const trackpadLike = !!e.wheelDeltaY && Math.abs(e.wheelDeltaY + 3 * e.deltaY) <= 1;
	// A mouse wheel moves in notches of 120.
	const notch = !!e.wheelDeltaY && e.wheelDeltaY % 120 === 0;
	const mouse = e.deltaMode !== 0 || (!!e.wheelDeltaY && (notch || !trackpadLike));
	if (mouse) return { zoom: Math.exp(clamp(-dy * 0.002, -0.5, 0.5)) };
	return { pan: [-dx, -dy] };
}
