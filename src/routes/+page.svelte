<script lang="ts">
	import { app, type Tab } from '#lib/app.svelte.ts';
	import { localStore } from '#lib/storage/index.ts';
	import { gapCount } from '#lib/model/gaps.ts';
	import { childIds, family, partnerIds } from '#lib/model/queries.ts';
	import { newPerson } from '#lib/model/mutations.ts';
	import TreeView from '#lib/components/TreeView.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import TodoView from '#lib/components/TodoView.svelte';
	import PersonSheet from '#lib/components/PersonSheet.svelte';
	import DataDialog from '#lib/components/DataDialog.svelte';

	// Load once, then save on every change (JSON.stringify reads the whole dataset, so the effect tracks it deeply).
	const saved = localStore.load();
	if (saved) app.data = saved;
	$effect(() => {
		localStore.save(JSON.parse(JSON.stringify(app.data)));
	});

	const tabs: [Tab, string][] = [['tree', 'Tree'], ['timeline', 'Timeline'], ['todo', 'Research to-do']];

	function openPerson(id: string) {
		app.tab = 'tree';
		app.select(id);
	}
	function onGhost(fid: string) {
		const f = family(app.data, fid)!;
		app.select(partnerIds(f)[0] ?? childIds(f)[0], 'child');
	}
	function addNew() {
		const p = newPerson(app.data);
		app.branch = 'all';
		app.select(p.id);
	}
	function setBranch(b: string) {
		app.branch = b;
		app.fitTree();
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && app.selected && !app.showData) app.select(null);
	}
</script>

<svelte:window onkeydown={onKey} />

<header class="top">
	<div class="brand">Family Tree <span>sketchbook</span></div>
	<nav class="tabs">
		{#each tabs as [k, l] (k)}
			<button aria-pressed={app.tab === k} onclick={() => (app.tab = k)}>{l}{#if k === 'todo'}<span class="count">{gapCount(app.data)}</span>{/if}</button>
		{/each}
	</nav>
	<div class="actions">
		<button class="btn" onclick={addNew}>+ New person</button>
		<button class="btn" onclick={() => (app.showData = true)}>Data</button>
	</div>
</header>

<div class="bar">
	{#if app.branches.length > 1}
		<button class="chip" aria-pressed={app.branch === 'all'} onclick={() => setBranch('all')}>Everyone</button>
		{#each app.branches as b (b.ids[0])}
			<button class="chip" aria-pressed={app.branch === b.label} onclick={() => setBranch(b.label)}>{b.label} <span style="opacity:.7">{b.ids.length}</span></button>
		{/each}
	{/if}
	<div class="legend">
		<span><span class="ink">Ink</span> = confirmed</span><span><span class="pen">pencil</span> = guess</span>
		<span>dashed line = likely or guessed link</span><span style="color:var(--warn)">orange = missing children</span>
	</div>
</div>

<div class="work">
	<main class="main" class:tree={app.tab === 'tree'}>
		{#if app.tab === 'tree'}
			<TreeView {onGhost} />
		{:else}
			<div class="pad">
				{#if app.tab === 'timeline'}
					<TimelineView />
				{:else}
					<TodoView onOpen={openPerson} />
				{/if}
			</div>
		{/if}
	</main>
	{#if app.selected && app.data.people.some((p) => p.id === app.selected)}
		<aside class="sheet">
			{#key app.selected}
				<PersonSheet pid={app.selected} />
			{/key}
		</aside>
	{/if}
</div>

{#if app.showData}
	<DataDialog onClose={() => (app.showData = false)} />
{/if}
