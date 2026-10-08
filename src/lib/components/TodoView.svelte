<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import { gaps } from '#lib/model/gaps.ts';
	import { displayName, person } from '#lib/model/queries.ts';

	let { onOpen }: { onOpen: (id: string) => void } = $props();

	const kindLabel = { missing: 'Missing', guess: 'Guess', todo: 'To do', check: 'Check' } as const;
	const all = $derived(gaps(app.data));
	const ids = $derived(Object.keys(all).filter((id) => app.visibleIds.includes(id) && person(app.data, id)));
</script>

{#if !ids.length}
	<div class="empty">Nothing outstanding here.</div>
{:else}
	<div class="todo">
		{#each ids as id (id)}
			<section>
				<h3><button onclick={() => onOpen(id)}>{displayName(person(app.data, id))}</button></h3>
				<ul>
					{#each all[id] as g, i (i)}
						<li class="k-{g.kind}"><span class="kind">{kindLabel[g.kind]}</span>{g.text}</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
