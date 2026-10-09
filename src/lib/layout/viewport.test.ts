import { describe, expect, it } from 'vitest';
import { centreOn, ensureVisible, fit, MAX_K, MIN_K, wheelAction, zoomAt, type Camera } from './viewport.ts';

const toScreen = (c: Camera, wx: number, wy: number) => [wx * c.k + c.x, wy * c.k + c.y];

describe('fit', () => {
	it('centres a small tree at 100% rather than zooming in', () => {
		const c = fit({ x: 0, y: 0, w: 200, h: 100 }, 1000, 600);
		expect(c.k).toBe(1);
		expect(toScreen(c, 100, 50)).toEqual([500, 300]);
	});

	it('shrinks a large tree to fit inside the padding', () => {
		const c = fit({ x: 0, y: 0, w: 2000, h: 500 }, 1000, 600, 50);
		expect(c.k).toBeCloseTo(0.45);
		const [l] = toScreen(c, 0, 0), [r] = toScreen(c, 2000, 0);
		expect(l).toBeCloseTo(50);
		expect(r).toBeCloseTo(950);
	});

	it('never zooms out past the minimum', () => {
		expect(fit({ x: 0, y: 0, w: 1e6, h: 10 }, 1000, 600).k).toBe(MIN_K);
	});
});

describe('zoomAt', () => {
	it('keeps the point under the cursor fixed', () => {
		const c0: Camera = { x: 30, y: -20, k: 0.8 };
		const c1 = zoomAt(c0, 1.5, 400, 250);
		const wx = (400 - c0.x) / c0.k, wy = (250 - c0.y) / c0.k;
		const [sx, sy] = toScreen(c1, wx, wy);
		expect(sx).toBeCloseTo(400);
		expect(sy).toBeCloseTo(250);
		expect(c1.k).toBeCloseTo(1.2);
	});

	it('clamps the scale', () => {
		expect(zoomAt({ x: 0, y: 0, k: 2 }, 10, 0, 0).k).toBe(MAX_K);
		expect(zoomAt({ x: 0, y: 0, k: 0.2 }, 0.01, 0, 0).k).toBe(MIN_K);
	});
});

describe('centreOn', () => {
	it('puts the world point in the middle at the current zoom', () => {
		const c = centreOn({ x: 0, y: 0, k: 0.5 }, 1000, 400, 800, 600);
		expect(c.k).toBe(0.5);
		expect(toScreen(c, 1000, 400)).toEqual([400, 300]);
	});
});

describe('ensureVisible', () => {
	const c: Camera = { x: 0, y: 0, k: 1 };
	it('leaves the camera alone when the box is already on screen', () => {
		expect(ensureVisible(c, { x: 100, y: 100, w: 150, h: 60 }, 800, 600)).toBe(c);
	});

	it('pans the minimum needed to bring a box in from the right and bottom', () => {
		const n = ensureVisible(c, { x: 900, y: 700, w: 150, h: 60 }, 800, 600, 20);
		expect(toScreen(n, 1050, 760)).toEqual([780, 580]);
	});

	it('pans to bring a box in from the left and top', () => {
		const n = ensureVisible({ x: 0, y: 0, k: 0.5 }, { x: -200, y: -100, w: 100, h: 50 }, 800, 600, 20);
		expect(toScreen(n, -200, -100)).toEqual([20, 20]);
	});
});

describe('wheelAction', () => {
	const base = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false };
	const isZoom = (a: ReturnType<typeof wheelAction>) => 'zoom' in a;

	it('treats trackpad pinch (Ctrl + wheel) as zoom, in towards negative deltaY', () => {
		const a = wheelAction({ ...base, deltaY: -10, ctrlKey: true });
		expect(isZoom(a) && a.zoom > 1).toBe(true);
	});

	it('treats ⌘ + scroll as zoom', () => {
		expect(isZoom(wheelAction({ ...base, deltaY: 5, metaKey: true }))).toBe(true);
	});

	it('treats a Chrome/Safari mouse wheel notch as zoom, out towards positive deltaY', () => {
		const a = wheelAction({ ...base, deltaY: 100, wheelDeltaY: -120 });
		expect(isZoom(a) && a.zoom < 1).toBe(true);
	});

	it('treats a Safari mouse wheel notch (deltaY 40, wheelDeltaY -120) as zoom', () => {
		const a = wheelAction({ ...base, deltaY: 40, wheelDeltaY: -120 });
		expect(isZoom(a) && a.zoom < 1).toBe(true);
		expect(isZoom(wheelAction({ ...base, deltaY: -80, wheelDeltaY: 240 }))).toBe(true);
	});

	it("recognises Safari's mouse wheel by its 1/4096 fraction, zooming one step per notch", () => {
		// Values reported by a real mouse and trackpad in Safari.
		const down = wheelAction({ ...base, deltaY: 4.000244140625, wheelDeltaY: -12 });
		const up = wheelAction({ ...base, deltaY: -4.000244140625, wheelDeltaY: 12 });
		expect(isZoom(down) && down.zoom).toBeCloseTo(Math.exp(-0.2));
		expect(isZoom(up) && up.zoom).toBeCloseTo(Math.exp(0.2));
		expect(wheelAction({ ...base, deltaY: -1, wheelDeltaY: 3 })).toEqual({ pan: [-0, 1] });
	});

	it('treats Firefox line-mode wheel as zoom', () => {
		expect(isZoom(wheelAction({ ...base, deltaY: 3, deltaMode: 1 }))).toBe(true);
	});

	it('treats trackpad two-finger scroll as pan', () => {
		expect(wheelAction({ ...base, deltaY: 12, wheelDeltaY: -36 })).toEqual({ pan: [-0, -12] });
		expect(wheelAction({ ...base, deltaX: 8, deltaY: 3, wheelDeltaY: -9 })).toEqual({ pan: [-8, -3] });
		expect(isZoom(wheelAction({ ...base, deltaY: 7.5 }))).toBe(false);
		// fractional deltaY (e.g. browser zoom not at 100%): wheelDeltaY is rounded
		expect(isZoom(wheelAction({ ...base, deltaY: 4.5, wheelDeltaY: -13 }))).toBe(false);
	});
});
