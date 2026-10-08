<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import { fmtDate } from '#lib/model/edtf.ts';
	import { displayName, lifeEvent, nameIsGuess, NOW, partnerIds, person } from '#lib/model/queries.ts';
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

	function partnershipTitle(fid: string, pid: string) {
		const f = app.data.families.find((f) => f.id === fid)!;
		const other = partnerIds(f).find((x) => x !== pid);
		return (f.relationship?.type === 'marriage' ? 'Married ' : 'Partnership from ') + fmtDate(f.relationship?.start?.edtf) + (other ? ' – ' + displayName(person(app.data, other)) : '');
	}
</script>

<div bind:clientWidth={width}>
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
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<text class="tlname" class:pencil={nameIsGuess(p)} x={X(r.start)} y={y + 14} onclick={() => app.select(r.id)}>{displayName(p)}</text>
					{#if r.birth && r.birth.end - r.birth.start > 0.2}
						<rect x={X(r.birth.start)} y={by} width={(r.birth.end - r.birth.start) * px} height="8" fill="url(#fin)"><title>Born {fmtDate(lifeEvent(app.data, r.id, 'birth')?.date?.edtf)}</title></rect>
					{/if}
					{#if !r.birth}
						<rect x={X(r.start)} y={by} width={(r.solidStart - r.start) * px} height="8" fill="url(#fin)"><title>Birth not recorded</title></rect>
					{/if}
					{#if r.solidEnd > r.solidStart}
						<rect class="life" class:guess={r.birthIsGuess} x={X(r.solidStart)} y={by} width={(r.solidEnd - r.solidStart) * px} height="8"><title>{r.living ? 'Living' : ''}</title></rect>
					{/if}
					{#if r.death}
						{#if r.death.end - r.death.start > 0.2}
							<rect x={X(r.death.start)} y={by} width={(r.death.end - r.death.start) * px} height="8" fill="url(#fout)"><title>Died {fmtDate(lifeEvent(app.data, r.id, 'death')?.date?.edtf)}</title></rect>
						{/if}
					{:else if !r.living}
						<rect x={X(r.solidEnd)} y={by} width={UNKNOWN_END_FADE * px} height="8" fill="url(#foutp)"><title>Date of death not recorded</title></rect>
					{/if}
					{#each r.partnerships as m (m.family.id)}
						<circle class="mdot" cx={X((m.range.start + m.range.end) / 2)} cy={by + 4} r="4.5"><title>{partnershipTitle(m.family.id, r.id)}</title></circle>
					{/each}
				{/each}
			</svg>
		</div>
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
