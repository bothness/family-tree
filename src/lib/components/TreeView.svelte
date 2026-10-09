<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { app } from '#lib/app.svelte.ts';
	import BlankPrompt from './BlankPrompt.svelte';
	import { cardDates, displayName, lifeEvent, nameIsGuess, person } from '#lib/model/queries.ts';
	import { GHOST_W, NODE_H, NODE_W, PHOTO_W, PORTRAIT_H, PORTRAIT_NOPHOTO_H, PORTRAIT_W, cardSize, layoutTree, routeShown, type TreeLayout } from '#lib/layout/tree.ts';
	import { DropdownMenu } from 'bits-ui';
	import { SILHOUETTE, silhouetteKey } from './Silhouette.svelte';
	import { photoOf } from '#lib/model/media.ts';
	import { centreOn, ensureVisible, fit, panBy, wheelAction, zoomAt, type Camera } from '#lib/layout/viewport.ts';

	let { onGhost }: { onGhost: (familyId: string) => void } = $props();

	/** Cards as drawn. Vertical tree: narrow cards, the photo above the name (V13). Horizontal tree: wide cards, the
	 *  photo beside it (V14). Either way the Photos switch only shows or hides the photos. */
	const portrait = $derived(!app.across);
	const size = $derived(
		portrait ? cardSize(PORTRAIT_W, app.showPhotos ? PORTRAIT_H : PORTRAIT_NOPHOTO_H) : cardSize(app.showPhotos ? PHOTO_W : NODE_W, NODE_H)
	);
	/** Portrait photo: the card's width less its padding, square. */
	const PP = PORTRAIT_W - 12;
	const layout = $derived(layoutTree(app.data, app.visibleBranches, app.activeFocus?.id, size, app.across));
	/** Card width and height as drawn, and the missing-children placeholders' (as big as a card left to right). */
	const CW = $derived(size.w),
		CH = $derived(size.h);
	const GW = $derived(app.across ? size.w : GHOST_W);
	/** A name over at most two lines of about `n` characters (portrait cards). */
	function twoLines(name: string, n: number): string[] {
		if (name.length <= n) return [name];
		const words = name.split(' ');
		let a = '';
		while (words.length && (a + ' ' + words[0]).trim().length <= n) a = (a + ' ' + words.shift()).trim();
		if (!a) a = words.shift()!;
		return [trunc(a, n), trunc(words.join(' '), n)].filter(Boolean);
	}
	const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
	const lineClass = { solid: 'ln', likely: 'ln probable', guess: 'ln guess', ghost: 'ln ghost', maybe: 'ln maybe' } as const;

	// ---- animation between layouts (V11) ----
	// Cards that stay glide from where they're drawn to their new place; people entering fade in; people leaving
	// go at once (fading them out while others move looked odd). Lines and markers are re-routed from the moving
	// cards every frame.
	const DURATION = 420;
	const dur = () => (prefersReducedMotion.current ? 0 : DURATION);
	type Pt = { x: number; y: number };
	const progress = new Tween(1, { easing: cubicOut });
	let from = $state.raw({ nodes: new Map<string, Pt>(), ghosts: new Map<string, Pt>() });
	let to = $state.raw<TreeLayout>(untrack(() => layout));
	const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
	const blend = (m: Map<string, Pt>, id: string, p: Pt, k: number) => {
		const f = m.get(id);
		return f ? { x: lerp(f.x, p.x, k), y: lerp(f.y, p.y, k) } : { x: p.x, y: p.y };
	};
	$effect.pre(() => {
		const L = layout;
		untrack(() => {
			// Where everything is drawn right now (possibly mid-animation): the starting point for the next one.
			const k = progress.current;
			const now = {
				nodes: new Map(to.nodes.map((n) => [n.id, blend(from.nodes, n.id, n, k)])),
				ghosts: new Map(to.ghosts.map((g) => [g.familyId, blend(from.ghosts, g.familyId, g, k)]))
			};
			const same = (p: Pt | undefined, q: Pt) => !!p && p.x === q.x && p.y === q.y;
			const moved =
				L.nodes.length !== to.nodes.length ||
				L.ghosts.length !== to.ghosts.length ||
				L.nodes.some((n) => !same(now.nodes.get(n.id), n)) ||
				L.ghosts.some((g) => !same(now.ghosts.get(g.familyId), g));
			if (moved && dur()) {
				from = now;
				progress.set(0, { duration: 0 });
				progress.set(1, { duration: dur() });
			} else {
				// Nothing moved (e.g. typing a name): no animation, nothing to re-route.
				from = { nodes: new Map(), ghosts: new Map() };
				progress.set(1, { duration: 0 });
			}
			to = L;
		});
	});
	const anim = $derived.by(() => {
		const k = progress.current;
		const animating = k < 1 && (from.nodes.size > 0 || from.ghosts.size > 0);
		if (!animating) return { nodes: to.nodes.map((n) => ({ ...n, o: 1 })), ghosts: to.ghosts.map((g) => ({ ...g, o: 1 })), lines: to.lines, anchors: to.anchors };
		const nodes = to.nodes.map((n) => ({ ...n, ...blend(from.nodes, n.id, n, k), o: from.nodes.has(n.id) ? 1 : k }));
		const ghosts = to.ghosts.map((g) => ({ ...g, ...blend(from.ghosts, g.familyId, g, k), o: from.ghosts.has(g.familyId) ? 1 : k }));
		return { nodes, ghosts, ...routeShown(app.data, to, nodes, ghosts) };
	});

	// Focus edge markers: "↑ parents" above someone whose parents are just out of view, "+3 children" below a family.
	// Clicking one shows one more generation that way.
	const STUB = 12, PILL_H = 18;
	// Each marker: a short line out of the card (up/down, or left/right in a left-to-right tree) and a pill at its end.
	const markers = $derived.by(() => {
		const at = new Map(anim.nodes.map((n) => [n.id, n]));
		const across = !!to.across;
		const pill = (text: string) => text.length * 6.6 + 18;
		return (app.focusView?.edges ?? []).flatMap((e) => {
			if (e.dir === 'up') {
				const n = at.get(e.personId);
				if (!n) return [];
				const text = across ? (e.hidden === 1 ? '← parent' : '← parents') : e.hidden === 1 ? '↑ parent' : '↑ parents';
				const w = pill(text);
				return across
					? [{ key: `u:${e.personId}`, up: true, x0: n.x, y0: n.y + CH / 2, x1: n.x - STUB, y1: n.y + CH / 2, px: n.x - STUB - w / 2, py: n.y + CH / 2, w, text }]
					: [{ key: `u:${e.personId}`, up: true, x0: n.x + CW / 2, y0: n.y, x1: n.x + CW / 2, y1: n.y - STUB, px: n.x + CW / 2, py: n.y - STUB - PILL_H / 2, w, text }];
			}
			const a = anim.anchors[e.familyId];
			if (!a) return [];
			const text = `+${e.hidden} ${e.hidden === 1 ? 'child' : 'children'}`;
			const w = pill(text);
			return across
				? [{ key: `d:${e.familyId}`, up: false, x0: a.x, y0: a.y, x1: a.bottom + STUB, y1: a.y, px: a.bottom + STUB + w / 2, py: a.y, w, text }]
				: [{ key: `d:${e.familyId}`, up: false, x0: a.x, y0: a.y, x1: a.x, y1: a.bottom + STUB, px: a.x, py: a.bottom + STUB + PILL_H / 2, w, text }];
		});
	});
	function extend(up: boolean) {
		const f = app.activeFocus;
		if (f) app.adjustFocus(up ? { up: f.up + 1 } : { down: f.down + 1 });
	}

	// ---- camera (V1) ----
	let box: HTMLDivElement | undefined = $state();
	let vw = $state(0),
		vh = $state(0);
	const fitAll = () => fit(layout.bounds, vw, vh);
	// The camera drawn (`cam`) follows `app.camera`: instantly for your own drags, wheel and pinch (which also
	// cancels any glide), gliding for automatic moves (fit, centring on someone, keeping the selection in view).
	const shown = new Tween<Camera>(untrack(() => app.camera) ?? { x: 0, y: 0, k: 1 }, { easing: cubicOut });
	const cam: Camera = $derived(shown.current);
	let instant = true;
	$effect(() => {
		const c = app.camera;
		if (!c) return;
		untrack(() => shown.set(c, { duration: instant ? 0 : dur() }));
		instant = false;
	});
	// `autoFitted`: the camera came from a fit and hasn't been moved since, so a resize (e.g. the person panel
	// closing at the same moment) should fit again rather than leave the tree off-centre.
	let autoFitted = false;
	/** Move the camera now (your own pan, zoom or pinch). */
	const set = (c: Camera) => {
		autoFitted = false;
		instant = true;
		app.camera = c;
	};
	/** Move the camera smoothly (automatic moves). */
	const glide = (c: Camera) => {
		autoFitted = false;
		app.camera = c;
	};
	/** Where the camera is heading (automatic moves made mid-glide aim from there). */
	const target = () => app.camera ?? cam;

	// Fit once when asked (camera reset to null), then hold still: edits re-run the layout but don't move the view.
	// The very first fit (opening the tree) jumps; later ones glide.
	let shownOnce = false;
	$effect(() => {
		if (app.camera === null && vw && vh && layout.bounds.w)
			untrack(() => {
				instant = !shownOnce;
				shownOnce = true;
				app.camera = fitAll();
				// Only a resize arriving straight after the fit (e.g. the person panel closing at the same moment)
				// re-fits; after that the view holds still, as usual.
				autoFitted = true;
				requestAnimationFrame(() => requestAnimationFrame(() => (autoFitted = false)));
			});
	});
	$effect(() => {
		void [vw, vh];
		untrack(() => {
			if (autoFitted && vw && vh && layout.bounds.w) app.camera = fitAll();
		});
	});

	$effect(() => {
		if (!box) return;
		const ro = new ResizeObserver(([e]) => {
			vw = e.contentRect.width;
			vh = e.contentRect.height;
		});
		ro.observe(box);
		return () => ro.disconnect();
	});

	// Keep the selected person on screen when they change or the canvas resizes (e.g. the person panel opens).
	// Edits don't trigger this, so the view stays put while sketching.
	$effect(() => {
		const id = app.selected;
		if (!id || !vw || !vh) return;
		untrack(() => {
			const n = layout.nodes.find((n) => n.id === id);
			if (!n) return;
			const t = target();
			const next = ensureVisible(t, { x: n.x, y: n.y, w: CW, h: CH }, vw, vh);
			if (next !== t) glide(next);
		});
	});

	// Pan to show people who have just appeared (e.g. a child added from the person panel), without refitting.
	let seen = new Set<string>();
	$effect(() => {
		const ids = layout.nodes.map((n) => n.id);
		untrack(() => {
			const fresh = seen.size && app.camera ? layout.nodes.filter((n) => !seen.has(n.id)) : [];
			seen = new Set(ids);
			// More than a few at once means a branch switch or data load, not someone just added.
			if (!fresh.length || fresh.length > 3 || app.centreTarget || !vw || !vh) return;
			const t = target();
			let c = t;
			for (const n of fresh) c = ensureVisible(c, { x: n.x, y: n.y, w: CW, h: CH }, vw, vh);
			if (c !== t) glide(c);
		});
	});

	// Centre on a person (from search). Runs again if the canvas resizes straight after (the person panel opening),
	// then clears the request a couple of frames later so later resizes don't snap back.
	$effect(() => {
		const id = app.centreTarget;
		if (!id || !vw || !vh) return;
		untrack(() => {
			const n = layout.nodes.find((n) => n.id === id);
			if (n) glide(centreOn(app.camera ?? fitAll(), n.x + CW / 2, n.y + CH / 2, vw, vh));
		});
		requestAnimationFrame(() => requestAnimationFrame(() => app.centreTarget === id && (app.centreTarget = null)));
	});

	const zoomBy = (f: number) => glide(zoomAt(target(), f, vw / 2, vh / 2));

	// Wheel needs a non-passive listener so it can stop the page scrolling.
	$effect(() => {
		if (!box) return;
		const el = box;
		let gesturing = false;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (gesturing && e.ctrlKey) return; // Safari pinch already handled below; don't zoom twice
			const a = wheelAction(e as WheelEvent & { wheelDeltaY?: number });
			const r = el.getBoundingClientRect();
			set('zoom' in a ? zoomAt(cam, a.zoom, e.clientX - r.left, e.clientY - r.top) : panBy(cam, ...a.pan));
		};
		// Safari reports trackpad pinch as non-standard gesture events rather than Ctrl + wheel.
		let lastScale = 1;
		const onGesture = (e: Event) => {
			e.preventDefault();
			const g = e as Event & { scale: number; clientX: number; clientY: number };
			gesturing = e.type !== 'gestureend';
			if (e.type === 'gesturestart') lastScale = 1;
			else if (gesturing) {
				const r = el.getBoundingClientRect();
				set(zoomAt(cam, g.scale / lastScale, g.clientX - r.left, g.clientY - r.top));
				lastScale = g.scale;
			}
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('gesturestart', onGesture);
		el.addEventListener('gesturechange', onGesture);
		el.addEventListener('gestureend', onGesture);
		return () => {
			el.removeEventListener('gestureend', onGesture);
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('gesturestart', onGesture);
			el.removeEventListener('gesturechange', onGesture);
		};
	});

	// Pointers: one drags to pan (after a few pixels, so a click still selects), two pinch to zoom.
	const DRAG_PX = 4;
	const pointers = new Map<number, { x: number; y: number }>();
	let start: { x: number; y: number } | null = null;
	let panning = $state(false);
	let swallowClick = false;

	function local(e: PointerEvent) {
		const r = box!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function down(e: PointerEvent) {
		// Primary button (or touch/pen) drags after a few pixels; the middle button pans straight away.
		const middle = e.pointerType === 'mouse' && e.button === 1;
		if (e.pointerType === 'mouse' && e.button !== 0 && !middle) return;
		if (middle) e.preventDefault(); // no browser autoscroll
		pointers.set(e.pointerId, local(e));
		if (pointers.size === 1) {
			start = local(e);
			swallowClick = false;
			if (middle) {
				startPan(e);
				swallowClick = false; // a middle-button drag isn't followed by a click to swallow
			}
		}
	}
	function move(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const p = local(e);
		if (pointers.size >= 2) {
			const [a, b] = [...pointers.entries()].map(([id, q]) => (id === e.pointerId ? p : q));
			const [a0, b0] = [...pointers.values()];
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
				mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
			const d = Math.hypot(a.x - b.x, a.y - b.y),
				d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
			set(zoomAt(panBy(cam, mid.x - mid0.x, mid.y - mid0.y), d0 ? d / d0 : 1, mid.x, mid.y));
			startPan(e);
		} else if (panning) {
			set(panBy(cam, p.x - prev.x, p.y - prev.y));
		} else if (start && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_PX) {
			startPan(e);
			set(panBy(cam, p.x - prev.x, p.y - prev.y));
		}
		pointers.set(e.pointerId, p);
	}
	function startPan(e: PointerEvent) {
		if (!panning) box!.setPointerCapture(e.pointerId);
		panning = true;
		swallowClick = true;
	}
	function up(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (!pointers.size) {
			panning = false;
			start = null;
		}
	}
	// A drag ends with a click on whatever is under the pointer; don't let it select a person.
	function clickCapture(e: MouseEvent) {
		if (swallowClick) {
			e.stopPropagation();
			swallowClick = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]') || app.showData) return;
		const inTree = t === document.body || !!box?.contains(t);
		const step = 80;
		const act: Record<string, () => void> = {
			'+': () => zoomBy(1.25),
			'=': () => zoomBy(1.25),
			'-': () => zoomBy(0.8),
			'0': () => app.fitTree()
		};
		if (inTree)
			Object.assign(act, {
				ArrowLeft: () => set(panBy(cam, step, 0)),
				ArrowRight: () => set(panBy(cam, -step, 0)),
				ArrowUp: () => set(panBy(cam, 0, step)),
				ArrowDown: () => set(panBy(cam, 0, -step))
			});
		const fn = act[e.key];
		if (fn) {
			e.preventDefault();
			fn();
		}
	}

	// While hand-picking people for a view, a click adds or removes the person instead of opening them.
	const cardClick = (id: string) => (app.picked ? app.togglePicked(id) : app.select(id));

	function key(e: KeyboardEvent, fn: () => void) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fn();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if !app.data.people.length}
	<div class="empty blank">
		<p class="blank-title">No one here yet.</p>
		{#if __SYNC__}
			<!-- Family edition: one shared tree (no demo here: it would go to everyone) -->
			<p>Use <b>+ New person</b> to start the family's tree. Everyone invited sees and edits the same tree.</p>
		{:else}
			<p>Use <b>+ New person</b> to start your tree, or <button class="btn small" onclick={() => app.loadDemo()}>Load the demo family</button> to look around first.</p>
			<p class="hint">The demo is the Darwins and Wedgwoods: Charles Darwin, his grandfather Erasmus, the potter Josiah Wedgwood and their families, with gaps and guesses as in a real tree.</p>
			<p class="hint">Your tree is kept in this browser, on this device, and isn't uploaded anywhere. Use <b>Data</b> to download a backup.</p>
		{/if}
	</div>
{:else if app.blank && !app.picked}
	<BlankPrompt />
{:else}
	<div
		class="canvas"
		class:panning
		class:picking={!!app.picked}
		bind:this={box}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		onpointerleave={(e) => !panning && up(e)}
		onclickcapture={clickCapture}
		role="presentation"
	>
		<svg width="100%" height="100%" role="img" aria-label="Family tree">
			<defs>
				<!-- avatars on cards (V10): photo clip and stand-in silhouettes -->
				<clipPath id="avatar-clip" clipPathUnits="userSpaceOnUse"><rect x="6" y="6" width="46" height="46" rx="5" /></clipPath>
				<clipPath id="avatar-clip-p" clipPathUnits="userSpaceOnUse"><rect x="6" y="6" width={PP} height={PP} rx="5" /></clipPath>
				{#each ['M', 'F', 'U'] as const as k (k)}
					<symbol id="sil-{k}" viewBox="0 0 36 36"><rect class="sil-bg" width="36" height="36" rx="5" />{#each SILHOUETTE[k] as d (d)}<path class="sil" {d} />{/each}</symbol>
				{/each}
			</defs>
			<g transform="translate({cam.x},{cam.y}) scale({cam.k})">
				{#each layout.labels as l (l.x)}
					<text class="brlabel" x={l.x} y={l.y}>{l.text}</text>
				{/each}
				{#each anim.lines as l (l.key)}
					<path class={lineClass[l.style]} d={l.d} />
				{/each}
				{#each anim.nodes as n (n.id)}
					{@const p = person(app.data, n.id)!}
					{@const guess = nameIsGuess(p)}
					{@const dates = cardDates(app.data, n.id)}
					{@const dateGuess = lifeEvent(app.data, n.id, 'birth')?.date?.status === 'guess' || dates === 'no dates yet'}
					{@const stage = p.research?.stage ?? 'none'}
					{@const tx = app.showPhotos ? 61 : 11}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<g
						class="node"
						class:sel={app.selected === n.id}
						class:picked={app.picked?.includes(n.id)}
						class:ph={p.placeholder}
						transform="translate({n.x},{n.y})"
						opacity={n.o < 1 ? n.o : undefined}
						tabindex="0"
						role="button"
						aria-label={displayName(p)}
						aria-pressed={app.picked ? app.picked.includes(n.id) : undefined}
						onclick={() => cardClick(n.id)}
						onkeydown={(e) => key(e, () => cardClick(n.id))}
					>
						<rect class="nbox" width={CW} height={CH} rx="6" />
						{#if portrait}
							<!-- V13: the photo across the top, then the name over up to two lines, centred, and the dates -->
							{@const top = app.showPhotos ? PP + 6 : 0}
							{#if app.showPhotos}
								{@const ph = photoOf(app.data, n.id)}
								{#if ph?.thumb}
									<image href={ph.thumb} x="6" y="6" width={PP} height={PP} clip-path="url(#avatar-clip-p)" preserveAspectRatio="xMidYMid slice" />
								{:else}
									<use href="#sil-{silhouetteKey(p.sex?.value)}" x="6" y="6" width={PP} height={PP} />
								{/if}
							{/if}
							{#each twoLines(displayName(p), guess ? 15 : 13) as line, i (i)}
								<text class="nm" class:pencil={guess} x={CW / 2} y={top + 20 + i * 15} text-anchor="middle">{line}</text>
							{/each}
							<text class="dt" class:pencil={dateGuess} x={CW / 2} y={CH - 9} text-anchor="middle">{dates}</text>
						{:else}
							{#if app.showPhotos}
								{@const ph = photoOf(app.data, n.id)}
								{#if ph?.thumb}
									<image href={ph.thumb} x="6" y="6" width="46" height="46" clip-path="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />
								{:else}
									<use href="#sil-{silhouetteKey(p.sex?.value)}" x="6" y="6" width="46" height="46" />
								{/if}
							{/if}
							<text class="nm" class:pencil={guess} x={tx} y="25">{trunc(displayName(p), guess ? 20 : 18)}</text>
							<text class="dt" class:pencil={dateGuess} x={tx} y="45">{dates}</text>
						{/if}
						<!-- research stage, bottom right, clear of the name and photo -->
						<circle class="stage {stage}" cx={CW - 10} cy={CH - 10} r="4"><title>Research: {stage === 'none' ? 'not set' : stage}</title></circle>
						{#if app.picked?.includes(n.id)}<text class="tick" x={CW - 14} y="20" text-anchor="middle">✓</text>{/if}
					</g>
				{/each}
				{#each markers as m (m.key)}
					<g class="edge" role="button" tabindex="0" aria-label="Show {m.up ? 'one more generation of parents' : 'one more generation of children'}" onclick={() => extend(m.up)} onkeydown={(e) => key(e, () => extend(m.up))}>
						<line x1={m.x0} y1={m.y0} x2={m.x1} y2={m.y1} />
						<rect x={m.px - m.w / 2} y={m.py - PILL_H / 2} width={m.w} height={PILL_H} rx={PILL_H / 2} />
						<text x={m.px} y={m.py + 4} text-anchor="middle">{m.text}</text>
					</g>
				{/each}
				{#each anim.ghosts as g (g.familyId)}
					<g
						class="ghost"
						class:maybe={!g.missing}
						transform="translate({g.x},{g.y})"
						opacity={g.o < 1 ? g.o : undefined}
						tabindex="0"
						role="button"
						onclick={() => onGhost(g.familyId)}
						onkeydown={(e) => key(e, () => onGhost(g.familyId))}
					>
						<rect width={GW} height={CH} rx="6" />
						<text x={GW / 2} y={CH / 2 + 4} text-anchor="middle">{g.missing ? `+${g.missing} more expected` : 'more children?'}</text>
					</g>
				{/each}
			</g>
		</svg>
		<div class="zoombar" role="toolbar" aria-label="Tree controls">
			<div class="zgroup" role="group" aria-label="Zoom">
				<button type="button" onclick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (−)">−</button>
				<button type="button" class="pct" onclick={() => zoomBy(1 / cam.k)} title="Back to 100%">{Math.round(cam.k * 100)}%</button>
				<button type="button" onclick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">+</button>
			</div>
			<div class="zgroup">
				<button type="button" onclick={() => app.fitTree()} aria-label="Fit to screen" title="Fit everyone on screen (0)">
					<svg class="zicon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
				</button>
			</div>
			<div class="zgroup">
				<label class="zswitch" title={app.showPhotos ? 'Hide photos on cards' : 'Show photos on cards'}>
					<input type="checkbox" role="switch" checked={app.showPhotos} onchange={(e) => app.setShowPhotos(e.currentTarget.checked)} />
					<span class="track" aria-hidden="true"></span>Photos
				</label>
			</div>
			<div class="zgroup">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="zlayout" title="Tree layout">{app.across ? 'Horizontal' : 'Vertical'}<svg class="zicon chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg></DropdownMenu.Trigger>
					<DropdownMenu.Portal>
						<DropdownMenu.Content class="menu" side="top" align="end" sideOffset={6}>
							<DropdownMenu.Item class="menu-item" onSelect={() => app.setAcross(false)}>{!app.across ? '✓ ' : ''}Vertical: generations top to bottom</DropdownMenu.Item>
							<DropdownMenu.Item class="menu-item" onSelect={() => app.setAcross(true)}>{app.across ? '✓ ' : ''}Horizontal: generations left to right</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			</div>
		</div>
	</div>
{/if}
