<script lang="ts">
	// Crop a new photo to a square before it's kept (V10): drag to move it, and zoom with the slider, the mouse wheel
	// or a pinch. The square is then saved as usual (resized, with a card thumbnail). The maths is in media/crop.ts.
	import { MAX_ZOOM, cutOf, initial, moveBy, zoomTo, type Crop } from '#lib/media/crop.ts';

	let { file, onDone, onCancel }: { file: Blob; onDone: (square: Blob) => void; onCancel: () => void } = $props();

	/** The frame's side on screen. */
	const VIEW = 280;
	/** Largest side kept from the crop (the store resizes it further). */
	const OUT_MAX = 1600;

	let canvas: HTMLCanvasElement | undefined = $state();
	let bmp = $state.raw<ImageBitmap | null>(null);
	let crop = $state<Crop | null>(null);
	let err = $state('');
	let saving = $state(false);

	$effect(() => {
		let gone = false;
		createImageBitmap(file, { imageOrientation: 'from-image' })
			.then((b) => {
				if (gone) return b.close();
				bmp = b;
				crop = initial(b.width, b.height, VIEW);
			})
			.catch(() => (err = "Couldn't read that image."));
		return () => {
			gone = true;
			bmp?.close();
		};
	});

	// Draw the photo as it sits in the frame, sharp on high-DPI screens.
	$effect(() => {
		if (!canvas || !bmp || !crop) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = canvas.height = Math.round(VIEW * dpr);
		const g = canvas.getContext('2d')!;
		g.imageSmoothingQuality = 'high';
		const s = (VIEW / Math.min(crop.w, crop.h)) * crop.zoom;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, VIEW, VIEW);
		g.drawImage(bmp, crop.x, crop.y, crop.w * s, crop.h * s);
	});

	// Dragging (one pointer) and pinching (two).
	const pointers = new Map<number, { x: number; y: number }>();
	let pinch: { d: number; zoom: number } | null = null;
	// In frame pixels (the frame shrinks to fit narrow screens).
	const local = (e: { clientX: number; clientY: number }) => {
		const r = canvas!.getBoundingClientRect(),
			k = VIEW / r.width;
		return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
	};
	const spread = () => {
		const [a, b] = [...pointers.values()];
		return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
	};
	function down(e: PointerEvent) {
		canvas!.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, local(e));
		if (pointers.size === 2 && crop) pinch = { d: spread().d, zoom: crop.zoom };
	}
	function move(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev || !crop) return;
		const p = local(e);
		pointers.set(e.pointerId, p);
		if (pointers.size === 1) crop = moveBy(crop, p.x - prev.x, p.y - prev.y);
		else if (pinch) {
			const { d, mx, my } = spread();
			crop = zoomTo(crop, pinch.zoom * (d / pinch.d), mx, my);
		}
	}
	function up(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinch = null;
	}
	function wheel(e: WheelEvent) {
		if (!crop) return;
		e.preventDefault();
		const p = local(e);
		crop = zoomTo(crop, crop.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.002)), p.x, p.y);
	}
	function key(e: KeyboardEvent) {
		if (!crop) return;
		const step = e.shiftKey ? 40 : 10;
		const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
		if (moves[e.key]) crop = moveBy(crop, ...moves[e.key]);
		else if (e.key === '+' || e.key === '=') crop = zoomTo(crop, crop.zoom * 1.15);
		else if (e.key === '-') crop = zoomTo(crop, crop.zoom / 1.15);
		else if (e.key === 'Escape') return onCancel();
		else return;
		e.preventDefault();
	}

	async function use() {
		if (!bmp || !crop) return;
		saving = true;
		const cut = cutOf(crop);
		const side = Math.max(1, Math.round(Math.min(cut.side, OUT_MAX)));
		const out = document.createElement('canvas');
		out.width = out.height = side;
		const g = out.getContext('2d')!;
		g.imageSmoothingQuality = 'high';
		g.drawImage(bmp, cut.x, cut.y, cut.side, cut.side, 0, 0, side, side);
		out.toBlob((b) => (b ? onDone(b) : ((err = "Couldn't crop that image."), (saving = false))), 'image/jpeg', 0.92);
	}
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onCancel()}>
	<div class="dialog crop" role="dialog" aria-label="Crop the photo" aria-modal="true">
		<div class="lbl" style="font-size:14px">Crop the photo</div>
		<p class="hint" style="margin:0">Drag to move it; zoom to fit the face in the square.</p>
		{#if err}
			<p class="hint warn">{err}</p>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<canvas
				bind:this={canvas}
				class="crop-frame"
				style="width:{VIEW}px;aspect-ratio:1"
				tabindex="0"
				aria-label="Photo: drag or use the arrow keys to move it, + and − to zoom"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
				onwheel={wheel}
				onkeydown={key}
			></canvas>
			<label class="crop-zoom">
				<span aria-hidden="true">−</span>
				<input type="range" min="1" max={MAX_ZOOM} step="0.01" value={crop?.zoom ?? 1} aria-label="Zoom" oninput={(e) => crop && (crop = zoomTo(crop, +e.currentTarget.value))} />
				<span aria-hidden="true">+</span>
			</label>
		{/if}
		<div class="row" style="justify-content:flex-end">
			<button class="btn small" onclick={onCancel}>Cancel</button>
			<button class="btn small primary" onclick={use} disabled={!crop || saving}>{saving ? 'Saving…' : 'Use photo'}</button>
		</div>
	</div>
</div>
