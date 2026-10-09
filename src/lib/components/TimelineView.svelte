<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import { fmtDate } from '#lib/model/edtf.ts';
	import { cardDates, displayName, lifeEvent, nameIsGuess, NOW, partnerIds, person } from '#lib/model/queries.ts';
	import type { EdtfDate } from '#lib/model/types.ts';
	import { timelineRows, UNKNOWN_END_FADE } from '#lib/layout/timeline.ts';

	let width = $state(900);
	const tl = $derived(timelineRows(app.data, app.visibleIds));
	const lo = $derived(tl.rows.length ? Math.floor((Math.min(...tl.rows.map((r) => r.start)) - 4) / 10) * 10 : 0);
	const hi = $derived(tl.rows.length ? Math.ceil((Math.max(...tl.rows.map((r) => r.end)) + 2) / 10) * 10 : 0);
	const px = $derived(Math.max(4, Math.min(12, (width - 72) / Math.max(1, hi - lo))));
	const W = $derived((hi - lo) * px + 40);
	const ROW = 46;
	const H = $derived(30 + tl.rows.length * ROW);
	const X = (y: number) => 20 + (y - lo) * px;
	const decades = $derived(Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10));
	const anyLiving = $derived(tl.rows.some((r) => r.living));

	// Tooltips for events (marriages and partnerships), on hover or keyboard focus, drawn above the circle.
	let box: HTMLDivElement | undefined = $state();
	let tip = $state<{ x: number; y: number; head: string; lines: string[] } | null>(null);
	function show(e: Event, head: string, lines: string[]) {
		if (!box) return;
		const t = (e.currentTarget as Element).getBoundingClientRect(),
			b = box.getBoundingClientRect();
		tip = { x: t.left + t.width / 2 - b.left, y: t.top - b.top, head, lines: lines.filter(Boolean) };
	}
	const hide = () => (tip = null);

	const sure = (d?: EdtfDate) => (d?.status === 'likely' ? ' (likely)' : d?.status === 'guess' ? ' (a guess)' : d?.status === 'conflicting' ? ' (sources disagree)' : '');
	const when = (d?: EdtfDate) => (d?.edtf ? fmtDate(d.edtf) + sure(d) : '');

	/** A marriage or partnership: what it was, with whom, when, and how it ended. */
	function partnershipTip(fid: string, pid: string): [string, string[]] {
		const f = app.data.families.find((f) => f.id === fid)!;
		const r = f.relationship;
		const other = partnerIds(f).find((x) => x !== pid);
		const head = r?.type === 'marriage' ? 'Marriage' : r?.type === 'civil-partnership' ? 'Civil partnership' : 'Partnership';
		const ended = { death: 'Until', divorce: 'Divorced', separation: 'Separated', annulment: 'Annulled', unknown: 'Ended' }[r?.endReason ?? 'unknown'];
		return [
			head,
			[
				other ? `With ${displayName(person(app.data, other))}` : 'Partner not known',
				r?.start?.edtf ? `${r.type === 'marriage' ? 'Married' : 'From'} ${when(r.start)}` : 'Date not known',
				r?.end?.edtf ? `${ended} ${when(r.end)}${r.endReason === 'death' ? ', when one of them died' : ''}` : '',
				r?.status && r.status !== 'confirmed' ? `The relationship itself is ${r.status === 'guess' ? 'a guess' : r.status}` : ''
			]
		];
	}
</script>

<div class="tl" bind:clientWidth={width} bind:this={box}>
	{#if !tl.rows.length}
		<div class="empty">Add a birth year to anyone and they'll appear here.</div>
	{:else}
		<p class="note">Bars run from birth to death; living people run to today (dashed line). Faded ends mean an approximate or unrecorded date. Circles mark marriages and partnerships.</p>
		<div class="tl-wrap">
			<svg width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label="Timeline">
				<defs>
					<linearGradient id="fin"><stop offset="0" class="gs" stop-opacity="0" /><stop offset="1" class="gs" stop-opacity="1" /></linearGradient>
					<linearGradient id="fout"><stop offset="0" class="gs" stop-opacity="1" /><stop offset="1" class="gs" stop-opacity="0" /></linearGradient>
					<linearGradient id="foutp"><stop offset="0" class="gsp" stop-opacity=".7" /><stop offset="1" class="gsp" stop-opacity="0" /></linearGradient>
				</defs>
				{#each decades as y (y)}
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
					<text class="tlname" class:pencil={nameIsGuess(p)} x={X(r.start)} y={y + 14} onclick={() => app.select(r.id)}
						>{displayName(p)}<tspan class="dt" class:pencil={lifeEvent(app.data, r.id, 'birth')?.date?.status === 'guess'} dx="8">{dates}</tspan></text
					>
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
					{#each r.partnerships as m (m.family.id)}
						{@const t = partnershipTip(m.family.id, r.id)}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable so the tooltip can be read from the keyboard) -->
						<circle class="mdot" cx={X((m.range.start + m.range.end) / 2)} cy={by + 4} r="4.5" tabindex="0" role="img" aria-label="{t[0]}: {t[1].join('. ')}" onpointerenter={(e) => show(e, ...t)} onpointerleave={hide} onfocus={(e) => show(e, ...t)} onblur={hide} />
					{/each}
				{/each}
			</svg>
		</div>
		{#if tip}
			<div class="tip" style="left:{tip.x}px;top:{tip.y}px" role="tooltip">
				<b>{tip.head}</b>
				{#each tip.lines as l (l)}<span>{l}</span>{/each}
			</div>
		{/if}
	{/if}
	{#if tl.undated.length}
		<p class="note">
			No dates yet:
			{#each tl.undated as id, i (id)}
				{@const p = person(app.data, id)!}
				<button class="plink" class:pencil={nameIsGuess(p)} onclick={() => app.select(id)}>{displayName(p)}</button>{i < tl.undated.length - 1 ? ', ' : ''}
			{/each}
		</p>
	{/if}
</div>
