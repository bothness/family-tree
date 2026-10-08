<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import { cardDates, displayName, lifeEvent, nameIsGuess, person } from '#lib/model/queries.ts';
	import { GHOST_W, NODE_H, NODE_W, layoutTree } from '#lib/layout/tree.ts';

	let { onGhost }: { onGhost: (familyId: string) => void } = $props();

	const layout = $derived(layoutTree(app.data, app.visibleBranches));
	const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
	const lineClass = { solid: 'ln', likely: 'ln probable', guess: 'ln guess', ghost: 'ln ghost' } as const;

	function key(e: KeyboardEvent, fn: () => void) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fn();
		}
	}
</script>

{#if !app.data.people.length}
	<div class="empty">No one here yet. Use <b>+ New person</b> to start a tree.</div>
{:else}
	<svg width={layout.width} height={layout.height} viewBox="0 0 {layout.width} {layout.height}" role="img" aria-label="Family tree">
		{#each layout.labels as l (l.x)}
			<text class="brlabel" x={l.x} y="18">{l.text}</text>
		{/each}
		{#each layout.lines as l, i (i)}
			<path class={lineClass[l.style]} d={l.d} />
		{/each}
		{#each layout.nodes as n (n.id)}
			{@const p = person(app.data, n.id)!}
			{@const guess = nameIsGuess(p)}
			{@const dates = cardDates(app.data, n.id)}
			{@const dateGuess = lifeEvent(app.data, n.id, 'birth')?.date?.status === 'guess' || dates === 'no dates yet'}
			{@const stage = p.research?.stage ?? 'none'}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<g
				class="node"
				class:sel={app.selected === n.id}
				class:ph={p.placeholder}
				transform="translate({n.x},{n.y})"
				tabindex="0"
				role="button"
				aria-label={displayName(p)}
				onclick={() => app.select(n.id)}
				onkeydown={(e) => key(e, () => app.select(n.id))}
			>
				<rect class="nbox" width={NODE_W} height={NODE_H} rx="6" />
				<text class="nm" class:pencil={guess} x="11" y="25">{trunc(displayName(p), guess ? 20 : 18)}</text>
				<text class="dt" class:pencil={dateGuess} x="11" y="45">{dates}</text>
				<circle class="stage {stage}" cx={NODE_W - 12} cy="12" r="4"><title>Research: {stage === 'none' ? 'not set' : stage}</title></circle>
			</g>
		{/each}
		{#each layout.ghosts as g (g.familyId)}
			<g
				class="ghost"
				transform="translate({g.x},{g.y})"
				tabindex="0"
				role="button"
				onclick={() => onGhost(g.familyId)}
				onkeydown={(e) => key(e, () => onGhost(g.familyId))}
			>
				<rect width={GHOST_W} height={NODE_H} rx="6" />
				<text x={GHOST_W / 2} y={NODE_H / 2 + 4} text-anchor="middle">{g.missing ? `+${g.missing} more expected` : 'more children?'}</text>
			</g>
		{/each}
	</svg>
{/if}
