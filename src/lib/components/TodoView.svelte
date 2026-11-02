<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import { gaps } from '#lib/model/gaps.ts';
	import { addTask, removeTask } from '#lib/model/mutations.ts';
	import { displayName, person } from '#lib/model/queries.ts';

	let { onOpen }: { onOpen: (id: string) => void } = $props();

	const kindLabel = { missing: 'Missing', guess: 'Guess', todo: 'To do', check: 'Check' } as const;
	const all = $derived(gaps(app.data));
	const ids = $derived(Object.keys(all).filter((id) => app.visibleIds.includes(id) && person(app.data, id)));

	let taskText = $state('');
	function add() {
		if (addTask(app.data, taskText)) taskText = '';
	}
</script>

<div class="todo">
	<!-- Tasks for the whole tree, not one person: shown in every view, deleted when done. -->
	{#if app.canEdit || app.data.tasks.length}
		<section>
			<h3>General</h3>
			{#if app.data.tasks.length}
				<ul class="tasks">
					{#each app.data.tasks as t (t.id)}
						<li><span>{t.text}</span>{#if app.canEdit}<button class="task-x" aria-label="Remove “{t.text}”" onclick={() => removeTask(app.data, t.id)}>×</button>{/if}</li>
					{/each}
				</ul>
			{/if}
			{#if app.canEdit}
				<div class="row">
					<input type="text" bind:value={taskText} placeholder="Add a task for the whole tree" style="flex:1" onkeydown={(e) => e.key === 'Enter' && add()} />
					<button class="btn small" onclick={add}>Add</button>
				</div>
			{/if}
		</section>
	{/if}
	{#if !ids.length}
		<div class="empty">Nothing outstanding for the people here.</div>
	{:else}
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
	{/if}
</div>
