<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { app } from '#lib/app.svelte.ts';
	import BlankPrompt from './BlankPrompt.svelte';
	import { cardDates, displayName, lifeEvent, nameIsGuess, person } from '#lib/model/queries.ts';
	import { GHOST_W, NODE_H, NODE_W, layoutTree, type GhostBox, type NodeBox, type TreeLayout } from '#lib/layout/tree.ts';
	import { routeConnectors } from '#lib/layout/connectors.ts';
	import { centreOn, ensureVisible, fit, panBy, wheelAction, zoomAt, type Camera } from '#lib/layout/viewport.ts';

	let { onGhost }: { onGhost: (familyId: string) => void } = $props();

	const layout = $derived(layoutTree(app.data, app.visibleBranches, app.activeFocus?.id));
	const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
	const lineClass = { solid: 'ln', likely: 'ln probable', guess: 'ln guess', ghost: 'ln ghost', maybe: 'ln maybe' } as const;

	// ---- animation between layouts (V11) ----
	// Cards that stay glide from where they're drawn to their new place; people entering fade in, people leaving
	// fade out where they were. Lines and markers are re-routed from the moving cards every frame.
	const DURATION = 420;
	const dur = () => (prefersReducedMotion.current ? 0 : DURATION);
	type Pt = { x: number; y: number };
	const progress = new Tween(1, { easing: cubicOut });
	let from = $state.raw({ nodes: new Map<string, Pt>(), ghosts: new Map<string, Pt>() });
	let to = $state.raw<TreeLayout>(untrack(() => layout));
	let leaving = $state.raw<{ nodes: NodeBox[]; ghosts: GhostBox[] }>({ nodes: [], ghosts: [] });
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
				leaving = {
					nodes: to.nodes.filter((n) => !L.nodes.some((m) => m.id === n.id)).map((n) => ({ ...n, ...now.nodes.get(n.id)! })),
					ghosts: to.ghosts.filter((g) => !L.ghosts.some((h) => h.familyId === g.familyId)).map((g) => ({ ...g, ...now.ghosts.get(g.familyId)! }))
				};
				from = now;
				progress.set(0, { duration: 0 });
				progress.set(1, { duration: dur() });
			} else {
				// Nothing moved (e.g. typing a name): no animation, nothing to re-route.
				from = { nodes: new Map(), ghosts: new Map() };
				leaving = { nodes: [], ghosts: [] };
				progress.set(1, { duration: 0 });
			}
			to = L;
		});
	});
	const anim = $derived.by(() => {
		const k = progress.current;
		const animating = k < 1 && (from.nodes.size > 0 || from.ghosts.size > 0);
		if (!animating) return { nodes: to.nodes.map((n) => ({ ...n, o: 1 })), ghosts: to.ghosts.map((g) => ({ ...g, o: 1 })), lines: to.lines, anchors: to.anchors, gone: [], goneGhosts: [], goneO: 0 };
		const nodes = to.nodes.map((n) => ({ ...n, ...blend(from.nodes, n.id, n, k), o: from.nodes.has(n.id) ? 1 : k }));
		const ghosts = to.ghosts.map((g) => ({ ...g, ...blend(from.ghosts, g.familyId, g, k), o: from.ghosts.has(g.familyId) ? 1 : k }));
		return { nodes, ghosts, ...routeConnectors(app.data, nodes, ghosts), gone: leaving.nodes, goneGhosts: leaving.ghosts, goneO: 1 - k };
	});

	// Focus edge markers: "↑ parents" above someone whose parents are just out of view, "+3 children" below a family.
	// Clicking one shows one more generation that way.
	const STUB = 12, PILL_H = 18;
	const markers = $derived.by(() => {
		const at = new Map(anim.nodes.map((n) => [n.id, n]));
		return (app.focusView?.edges ?? []).flatMap((e) => {
			if (e.dir === 'up') {
				const n = at.get(e.personId);
				return n ? [{ key: `u:${e.personId}`, up: true, x: n.x + NODE_W / 2, y0: n.y, y1: n.y - STUB, text: e.hidden === 1 ? '↑ parent' : '↑ parents' }] : [];
			}
			const a = anim.anchors[e.familyId];
			if (!a) return [];
			return [{
				key: `d:${e.familyId}`,
				up: false,
				x: a.x,
				y0: a.y,
				y1: a.bottom + STUB,
				text: `+${e.hidden} ${e.hidden === 1 ? 'child' : 'children'}`
			}];
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
			const next = ensureVisible(t, { x: n.x, y: n.y, w: NODE_W, h: NODE_H }, vw, vh);
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
			for (const n of fresh) c = ensureVisible(c, { x: n.x, y: n.y, w: NODE_W, h: NODE_H }, vw, vh);
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
			if (n) glide(centreOn(app.camera ?? fitAll(), n.x + NODE_W / 2, n.y + NODE_H / 2, vw, vh));
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
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		pointers.set(e.pointerId, local(e));
		if (pointers.size === 1) {
			start = local(e);
			swallowClick = false;
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
	<div class="empty">No one here yet. Use <b>+ New person</b> to start a tree.</div>
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
			<g transform="translate({cam.x},{cam.y}) scale({cam.k})">
				{#each layout.labels as l (l.x)}
					<text class="brlabel" x={l.x} y={l.y}>{l.text}</text>
				{/each}
				{#each anim.lines as l (l.key)}
					<path class={lineClass[l.style]} d={l.d} />
				{/each}
				{#each anim.gone as n (n.id)}
					<!-- leaving: fades out where it was -->
					{@const p = person(app.data, n.id)}
					<g class="node leaving" transform="translate({n.x},{n.y})" opacity={anim.goneO} aria-hidden="true">
						<rect class="nbox" width={NODE_W} height={NODE_H} rx="6" />
						{#if p}<text class="nm" class:pencil={nameIsGuess(p)} x="11" y="25">{trunc(displayName(p), 18)}</text>{/if}
					</g>
				{/each}
				{#each anim.goneGhosts as g (g.familyId)}
					<g class="ghost leaving" class:maybe={!g.missing} transform="translate({g.x},{g.y})" opacity={anim.goneO} aria-hidden="true">
						<rect width={GHOST_W} height={NODE_H} rx="6" />
					</g>
				{/each}
				{#each anim.nodes as n (n.id)}
					{@const p = person(app.data, n.id)!}
					{@const guess = nameIsGuess(p)}
					{@const dates = cardDates(app.data, n.id)}
					{@const dateGuess = lifeEvent(app.data, n.id, 'birth')?.date?.status === 'guess' || dates === 'no dates yet'}
					{@const stage = p.research?.stage ?? 'none'}
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
						<rect class="nbox" width={NODE_W} height={NODE_H} rx="6" />
						<text class="nm" class:pencil={guess} x="11" y="25">{trunc(displayName(p), guess ? 20 : 18)}</text>
						<text class="dt" class:pencil={dateGuess} x="11" y="45">{dates}</text>
						<circle class="stage {stage}" cx={NODE_W - 12} cy="12" r="4"><title>Research: {stage === 'none' ? 'not set' : stage}</title></circle>
						{#if app.picked?.includes(n.id)}<text class="tick" x={NODE_W - 14} y={NODE_H - 9} text-anchor="middle">✓</text>{/if}
					</g>
				{/each}
				{#each markers as m (m.key)}
					{@const w = m.text.length * 6.6 + 18}
					{@const top = m.up ? m.y1 - PILL_H : m.y1}
					<g class="edge" role="button" tabindex="0" aria-label="Show {m.up ? 'one more generation up' : 'one more generation down'}" onclick={() => extend(m.up)} onkeydown={(e) => key(e, () => extend(m.up))}>
						<line x1={m.x} y1={m.y0} x2={m.x} y2={m.y1} />
						<rect x={m.x - w / 2} y={top} width={w} height={PILL_H} rx={PILL_H / 2} />
						<text x={m.x} y={top + 13} text-anchor="middle">{m.text}</text>
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
						<rect width={GHOST_W} height={NODE_H} rx="6" />
						<text x={GHOST_W / 2} y={NODE_H / 2 + 4} text-anchor="middle">{g.missing ? `+${g.missing} more expected` : 'more children?'}</text>
					</g>
				{/each}
			</g>
		</svg>
		<div class="zoombar" role="group" aria-label="Zoom">
			<button type="button" onclick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (−)">−</button>
			<button type="button" class="pct" onclick={() => zoomBy(1 / cam.k)} title="Back to 100%">{Math.round(cam.k * 100)}%</button>
			<button type="button" onclick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">+</button>
			<button type="button" onclick={() => app.fitTree()} title="Show everyone (0)">Fit</button>
		</div>
	</div>
{/if}
