import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, clamp, cutOf, initial, moveBy, zoomTo } from './crop.ts';

describe('square crop', () => {
	it('starts as large as fits: the whole height of a landscape photo, centred across', () => {
		const c = initial(1200, 800, 300);
		expect(cutOf(c)).toEqual({ x: 200, y: 0, side: 800 });
	});

	it('starts a portrait photo nearer the top, where faces are', () => {
		const c = initial(800, 1200, 300);
		const cut = cutOf(c);
		expect(cut.side).toBe(800);
		expect(cut.y).toBeCloseTo(80); // 20% of the 400 spare
	});

	it('never lets the photo leave a gap in the frame', () => {
		const c = initial(1200, 800, 300);
		expect(moveBy(c, 1000, 0).x).toBe(0);
		expect(moveBy(c, -1000, 0).x).toBeCloseTo(300 - 1200 * (300 / 800));
		expect(moveBy(c, 0, 50).y).toBe(0);
		const cut = cutOf(moveBy(c, -1000, 0));
		expect(cut.x + cut.side).toBeCloseTo(1200);
	});

	it('zooms between 1 and the maximum, keeping the point under the pointer still', () => {
		const c = initial(1200, 800, 300);
		const z = zoomTo(c, 2, 150, 150);
		expect(cutOf(z).side).toBeCloseTo(400);
		// The middle of the frame shows the same spot as before.
		const mid = (k: typeof c) => cutOf(k).x + cutOf(k).side / 2;
		expect(mid(z)).toBeCloseTo(mid(c));
		expect(zoomTo(c, 10).zoom).toBe(MAX_ZOOM);
		expect(zoomTo(c, 0.2).zoom).toBe(1);
	});

	it('zooming back out pulls the photo back over the frame', () => {
		const c = moveBy(zoomTo(initial(1000, 1000, 300), 3), -500, -500);
		const back = zoomTo(c, 1);
		expect(cutOf(back)).toEqual({ x: 0, y: 0, side: 1000 });
	});

	it('keeps the cut inside the photo', () => {
		const c = clamp({ w: 500, h: 400, view: 300, zoom: 1.5, x: -999, y: -999 });
		const cut = cutOf(c);
		expect(cut.x + cut.side).toBeLessThanOrEqual(500 + 1e-9);
		expect(cut.y + cut.side).toBeLessThanOrEqual(400 + 1e-9);
	});
});
