<script lang="ts">
	import { flushSync } from 'svelte';
	import { app } from '#lib/app.svelte.ts';
	import { dateUnsure, datesDisagree, fmtDate } from '#lib/model/edtf.ts';
	import { cardDates, displayName, lifeEvent, nameIsGuess, NOW, person } from '#lib/model/queries.ts';
	import type { EdtfDate } from '#lib/model/types.ts';
	import { MAX_PX, MIN_PX, timelineRows, timeTicks, UNKNOWN_END_FADE, type TimelineEvent, type TimelineEventKind } from '#lib/layout/timeline.ts';
	import { wheelAction } from '#lib/layout/viewport.ts';

	let width = $state(900);
	const tl = $derived(timelineRows(app.data, app.visibleIds));
	const lo = $derived(tl.rows.length ? Math.floor((Math.min(...tl.rows.map((r) => r.start)) - 4) / 10) * 10 : 0);
	const hi = $derived(tl.rows.length ? Math.ceil((Math.max(...tl.rows.map((r) => r.end)) + 2) / 10) * 10 : 0);
	// Pixels per year: fitted to the width until you zoom (wheel or pinch), which stretches only the time axis.
	let zoomPx = $state<number | null>(null);
	const px = $derived(zoomPx ?? Math.max(4, Math.min(12, (width - 72) / Math.max(1, hi - lo))));
	const W = $derived((hi - lo) * px + 40);
	const ROW = 40;
	const H = $derived(30 + tl.rows.length * ROW);
	const X = (y: number) => 20 + (y - lo) * px;
	const ticks = $derived(timeTicks(lo, hi, px));
	const anyLiving = $derived(tl.rows.some((r) => r.living));
	const rowOf = $derived(new Map(tl.rows.map((r, i) => [r.id, i])));
	/** The middle of a row's bar. */
	const mid = (i: number) => 30 + i * ROW + 26;

	/** Each kind of event has its own symbol, centred on 0,0: a ring for a marriage, a diamond for a divorce or
	 *  separation, an upward triangle for a child's birth. The legend draws the same shapes. */
	const SHAPE: Record<TimelineEventKind, string> = {
		marriage: 'M-3.8 0a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0 -7.6 0Z',
		end: 'M0 -4.6L4.6 0L0 4.6L-4.6 0Z',
		child: 'M-4.2 3.4H4.2L0 -4.2Z'
	};

	// Tooltips for events, on hover or keyboard focus, drawn above the symbol, with a thin line down (or up) to the
	// partner or child the event links to, when they're on the timeline.
	let box: HTMLDivElement | undefined = $state();
	let tip = $state<{ x: number; y: number; head: string; lines: string[] } | null>(null);
	let link = $state<{ x: number; y1: number; y2: number; unsure: boolean } | null>(null);
	function show(e: Event, ev: TimelineEvent, i: number, head: string, lines: string[]) {
		if (!box) return;
		const t = (e.currentTarget as Element).getBoundingClientRect(),
			b = box.getBoundingClientRect();
		tip = { x: t.left + t.width / 2 - b.left, y: t.top - b.top, head, lines: lines.filter(Boolean) };
		const j = ev.other ? rowOf.get(ev.other) : undefined;
		if (j === undefined || j === i) return void (link = null);
		// From the edge of this symbol to the edge of the other one (the same event on a partner's row) or of the child's bar.
		const down = j > i ? 1 : -1;
		link = { x: X(ev.at), y1: mid(i) + down * 4.6, y2: mid(j) - down * (ev.kind === 'child' ? 4 : 4.6), unsure: ev.linkUnsure };
	}
	const hide = () => ((tip = null), (link = null));

	// Navigation, as on the tree: the wheel (or pinch) zooms the time axis at the pointer; dragging pans both ways.
	// The bars scroll in their own box (`wrap`), so the scroll bars stay, and a trackpad's two-finger scroll is the
	// browser's own.
	let wrap: HTMLDivElement | undefined = $state();
	/** Stretch the time axis by `f`, keeping the year under `cx` (pixels from the box's left edge) where it is. */
	function zoomX(f: number, cx: number) {
		if (!wrap) return;
		const year = lo + (wrap.scrollLeft + cx - 20) / px;
		flushSync(() => (zoomPx = Math.min(MAX_PX, Math.max(MIN_PX, px * f))));
		wrap.scrollLeft = 20 + (year - lo) * px - cx;
	}
	const panBy = (dx: number, dy: number) => wrap && ((wrap.scrollLeft -= dx), (wrap.scrollTop -= dy));

	// Wheel needs a non-passive listener so it can stop the box scrolling when it zooms.
	$effect(() => {
		if (!wrap) return;
		const el = wrap;
		let gesturing = false;
		const onWheel = (e: WheelEvent) => {
			if (gesturing && e.ctrlKey) return e.preventDefault(); // Safari pinch is handled below
			const a = wheelAction(e as WheelEvent & { wheelDeltaY?: number });
			if (!('zoom' in a)) return; // a trackpad scroll (or Safari's wheel): let the box scroll
			e.preventDefault();
			zoomX(a.zoom, e.clientX - el.getBoundingClientRect().left);
		};
		// Safari reports trackpad pinch as non-standard gesture events rather than Ctrl + wheel.
		let lastScale = 1;
		const onGesture = (e: Event) => {
			e.preventDefault();
			const g = e as Event & { scale: number; clientX: number };
			gesturing = e.type !== 'gestureend';
			if (e.type === 'gesturestart') lastScale = 1;
			else if (gesturing) {
				zoomX(g.scale / lastScale, g.clientX - el.getBoundingClientRect().left);
				lastScale = g.scale;
			}
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('gesturestart', onGesture);
		el.addEventListener('gesturechange', onGesture);
		el.addEventListener('gestureend', onGesture);
		return () => {
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('gesturestart', onGesture);
			el.removeEventListener('gesturechange', onGesture);
			el.removeEventListener('gestureend', onGesture);
		};
	});

	// Pointers: one drags to pan (after a few pixels, so a click still selects), two pinch to zoom the time axis.
	const DRAG_PX = 4;
	const pointers = new Map<number, { x: number; y: number }>();
	let start: { x: number; y: number } | null = null;
	let panning = $state(false);
	let swallowClick = false;
	function local(e: PointerEvent) {
		const r = wrap!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function down(e: PointerEvent) {
		// Primary button (or touch/pen) drags after a few pixels; the middle button pans straight away.
		const middle = e.pointerType === 'mouse' && e.button === 1;
		if (e.pointerType === 'mouse' && e.button !== 0 && !middle) return;
		// Leave the scroll bars to the browser.
		const r = wrap!.getBoundingClientRect();
		if (e.clientX - r.left >= wrap!.clientWidth || e.clientY - r.top >= wrap!.clientHeight) return;
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
			const d = Math.hypot(a.x - b.x, a.y - b.y),
				d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
			panBy((a.x + b.x - a0.x - b0.x) / 2, (a.y + b.y - a0.y - b0.y) / 2);
			zoomX(d0 ? d / d0 : 1, (a.x + b.x) / 2);
			startPan(e);
		} else if (panning) {
			panBy(p.x - prev.x, p.y - prev.y);
		} else if (start && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_PX) {
			startPan(e);
			panBy(p.x - prev.x, p.y - prev.y);
		}
		pointers.set(e.pointerId, p);
	}
	function startPan(e: PointerEvent) {
		if (!panning) wrap!.setPointerCapture(e.pointerId);
		panning = true;
		swallowClick = true;
		hide();
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

	const sure = (d?: EdtfDate) => (datesDisagree(d?.edtf) ? ' (sources disagree)' : '');
	const when = (d?: EdtfDate) => (d?.edtf ? fmtDate(d.edtf) + sure(d) : '');

	const offTimeline = (id?: string) => (id && !rowOf.has(id) ? `${displayName(person(app.data, id))} isn't on the timeline` : '');
	const sureness = (s?: string) => (s === 'guess' ? 'a guess' : s);

	/** What an event was, with whom, and when: the head and lines of its tooltip. */
	function eventTip(ev: TimelineEvent): [string, string[]] {
		const r = ev.family.relationship;
		if (ev.kind === 'child') {
			const c = person(app.data, ev.other!),
				ref = ev.family.children.find((x) => x.personId === ev.other);
			const sex = c?.sex?.value;
			return [
				`Birth of a ${sex === 'M' ? 'son' : sex === 'F' ? 'daughter' : 'child'}`,
				[
					displayName(c),
					`Born ${when(lifeEvent(app.data, ev.other!, 'birth')?.date)}`,
					ref?.relation === 'adopted' ? 'Adopted' : '',
					ref?.status && ref.status !== 'confirmed' ? `Being their child is ${sureness(ref.status)}` : '',
					offTimeline(ev.other)
				]
			];
		}
		const withWhom = ev.other ? `With ${displayName(person(app.data, ev.other))}` : 'Partner not known';
		const doubt = r?.status && r.status !== 'confirmed' ? `The relationship itself is ${sureness(r.status)}` : '';
		if (ev.kind === 'end') {
			const head = { divorce: 'Divorce', separation: 'Separation', annulment: 'Annulment' }[r!.endReason as 'divorce'];
			const verb = { divorce: 'Divorced', separation: 'Separated', annulment: 'Annulled' }[r!.endReason as 'divorce'];
			return [head, [withWhom, `${verb} ${when(r!.end)}`, r?.start?.edtf ? `${r.type === 'marriage' ? 'Married' : 'Together from'} ${when(r.start)}` : '', doubt, offTimeline(ev.other)]];
		}
		const head = r?.type === 'marriage' ? 'Marriage' : r?.type === 'civil-partnership' ? 'Civil partnership' : 'Partnership';
		const ended = { death: 'Until', divorce: 'Divorced', separation: 'Separated', annulment: 'Annulled', unknown: 'Ended' }[r?.endReason ?? 'unknown'];
		return [
			head,
			[
				withWhom,
				`${r?.type === 'marriage' ? 'Married' : 'From'} ${when(r?.start)}`,
				r?.end?.edtf ? `${ended} ${when(r.end)}${r.endReason === 'death' ? ', when one of them died' : ''}` : '',
				doubt,
				offTimeline(ev.other)
			]
		];
	}
</script>

<!-- A click on the timeline's background (not a name, circle or link) closes the person panel. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="tl" bind:clientWidth={width} bind:this={box} onclick={(e) => !(e.target as Element).closest('.tlname, .tlbar, .tev, button, a') && app.selected && app.select(null)}>
	{#if !tl.rows.length}
		<div class="empty">Add a birth year to anyone and they'll appear here.</div>
	{:else}
		<p class="note">Bars run from birth to death; living people run to today (dashed line). Faded ends mean an approximate or unrecorded date.</p>
		<div class="legend tl-key">
			{#each [['marriage', 'marriage or partnership'], ['end', 'divorce or separation'], ['child', 'birth of a child']] as [k, label] (k)}
				<span class="ev-key"><svg viewBox="-6.5 -6.5 13 13" aria-hidden="true"><path class="tev {k}" d={SHAPE[k as TimelineEventKind]} /></svg> = {label}</span>
			{/each}
		</div>
		<div
			class="tl-wrap"
			class:panning
			bind:this={wrap}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onclickcapture={clickCapture}
			onscroll={() => tip && hide()}
		>
			<div class="tl-inner">
				<svg width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label="Timeline">
					<defs>
						<linearGradient id="fin"><stop offset="0" class="gs" stop-opacity="0" /><stop offset="1" class="gs" stop-opacity="1" /></linearGradient>
						<linearGradient id="fout"><stop offset="0" class="gs" stop-opacity="1" /><stop offset="1" class="gs" stop-opacity="0" /></linearGradient>
						<linearGradient id="foutp"><stop offset="0" class="gsp" stop-opacity=".7" /><stop offset="1" class="gsp" stop-opacity="0" /></linearGradient>
					</defs>
					{#each ticks as y (y)}
						<path class="axis" d="M{X(y)} 22V{H}" /><text class="axt" x={X(y)} y="15" text-anchor="middle">{y}</text>
					{/each}
					{#if anyLiving}<path class="today" d="M{X(NOW)} 22V{H}" />{/if}
					{#each tl.rows as r, i (r.id)}
						{@const p = person(app.data, r.id)!}
						{@const y = 30 + i * ROW}
						{@const by = y + 22}
						{@const dates = cardDates(app.data, r.id)}
						<!-- the name, then the years in grey as on the tree cards -->
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<text class="tlname" class:pencil={nameIsGuess(p)} x={X(r.start)} y={y + 16} onclick={() => app.select(r.id)}
							>{displayName(p)}<tspan class="dt" class:pencil={dateUnsure(lifeEvent(app.data, r.id, 'birth')?.date?.edtf)} dx="8">{dates}</tspan></text
						>
						<!-- the bar opens the person, like their name; an invisible strip makes it easier to hit -->
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<g class="tlbar" onclick={() => app.select(r.id)}>
							<rect class="tlhit" x={X(r.start)} y={by - 4} width={(r.end - r.start) * px} height="16" />
							{#if r.birth && r.birth.end - r.birth.start > 0.2}
								<rect x={X(r.birth.start)} y={by} width={(r.birth.end - r.birth.start) * px} height="8" fill="url(#fin)" />
							{/if}
							{#if !r.birth}
								<rect x={X(r.start)} y={by} width={(r.solidStart - r.start) * px} height="8" fill="url(#fin)" />
							{/if}
							{#if r.solidEnd > r.solidStart}
								<rect class="life" class:guess={r.birthIsGuess} x={X(r.solidStart)} y={by} width={(r.solidEnd - r.solidStart) * px} height="8" />
							{/if}
							{#if r.death}
								{#if r.death.end - r.death.start > 0.2}
									<rect x={X(r.death.start)} y={by} width={(r.death.end - r.death.start) * px} height="8" fill="url(#fout)" />
								{/if}
							{:else if !r.living}
								<rect x={X(r.solidEnd)} y={by} width={UNKNOWN_END_FADE * px} height="8" fill="url(#foutp)" />
							{/if}
						</g>
						<!-- children's births first, so the rings and diamonds stay on top where they meet -->
						{#each [...r.events].sort((a, b) => +(a.kind !== 'child') - +(b.kind !== 'child')) as ev (ev.kind + ev.family.id + (ev.other ?? ''))}
							{@const t = eventTip(ev)}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable so the tooltip can be read from the keyboard) -->
							<path class="tev {ev.kind}" class:pencil={ev.dateUnsure} d={SHAPE[ev.kind]} transform="translate({X(ev.at)} {by + 4})" tabindex="0" role="img" aria-label="{t[0]}: {t[1].filter(Boolean).join('. ')}" onpointerenter={(e) => show(e, ev, i, ...t)} onpointerleave={hide} onfocus={(e) => show(e, ev, i, ...t)} onblur={hide} />
						{/each}
					{/each}
					{#if link}<path class="tlink" class:unsure={link.unsure} d="M{link.x} {link.y1}V{link.y2}" />{/if}
				</svg>
			{@render undated()}
			</div>
		</div>
		{#if tip}
			<div class="tip" style="left:{tip.x}px;top:{tip.y}px" role="tooltip">
				<b>{tip.head}</b>
				{#each tip.lines as l (l)}<span>{l}</span>{/each}
			</div>
		{/if}
	{/if}
	{#if !tl.rows.length}{@render undated()}{/if}
</div>

{#snippet undated()}
	{#if tl.undated.length}
		<p class="note tl-undated">
			No dates yet:
			{#each tl.undated as id, i (id)}
				{@const p = person(app.data, id)!}
				<button class="plink" class:pencil={nameIsGuess(p)} onclick={() => app.select(id)}>{displayName(p)}</button>{i < tl.undated.length - 1 ? ', ' : ''}
			{/each}
		</p>
	{/if}
{/snippet}
