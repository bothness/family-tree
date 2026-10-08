<script lang="ts">
	import { app, type Tab } from '#lib/app.svelte.ts';
	import { localStore } from '#lib/storage/index.ts';
	import { gapCount } from '#lib/model/gaps.ts';
	import { childIds, displayName, family, partnerIds, person } from '#lib/model/queries.ts';
	import { newPerson } from '#lib/model/mutations.ts';
	import { DEFAULT_FOCUS, type FocusWidth } from '#lib/model/focus.ts';
	import type { Focus } from '#lib/app.svelte.ts';
	import TreeView from '#lib/components/TreeView.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import TodoView from '#lib/components/TodoView.svelte';
	import PersonSheet from '#lib/components/PersonSheet.svelte';
	import DataDialog from '#lib/components/DataDialog.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';

	// Load once, then save on every change (JSON.stringify reads the whole dataset, so the effect tracks it deeply).
	const saved = localStore.load();
	if (saved) app.data = saved;
	$effect(() => {
		localStore.save(JSON.parse(JSON.stringify(app.data)));
	});

	// Focus lives in the page address (#focus=…&up=…&down=…&w=…), so Back undoes a focus change, reload keeps it,
	// and a focus view can be bookmarked.
	const WIDTHS: [FocusWidth, string, string][] = [
		['direct', 'Direct line', 'Ancestors and descendants only'],
		['siblings', '+ Siblings', 'Also brothers, sisters, aunts and uncles'],
		['all', 'All relatives', 'Also cousins, nieces and nephews']
	];
	function readHash(): Focus | null {
		const h = new URLSearchParams(location.hash.slice(1));
		const id = h.get('focus');
		if (!id) return null;
		const n = (k: string, dflt: number) => {
			const v = Number(h.get(k));
			return h.has(k) && Number.isInteger(v) && v >= 0 ? Math.min(v, 20) : dflt;
		};
		const w = h.get('w') as FocusWidth;
		return { id, up: n('up', DEFAULT_FOCUS.up), down: n('down', DEFAULT_FOCUS.down), width: WIDTHS.some(([k]) => k === w) ? w : DEFAULT_FOCUS.width };
	}
	const hashOf = (f: Focus | null) => (f ? '#' + new URLSearchParams({ focus: f.id, up: `${f.up}`, down: `${f.down}`, w: f.width }) : '');
	const currentHash = () => (location.hash === '#' ? '' : location.hash);
	app.focus = readHash();
	$effect(() => {
		if (app.focus && !app.activeFocus) app.focus = null; // focused person was deleted
		const h = hashOf(app.focus);
		if (h !== currentHash()) location.hash = h;
	});
	function onHashChange() {
		const f = readHash();
		if (hashOf(f) !== hashOf(app.focus)) {
			app.focus = f;
			app.fitTree();
		}
	}

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
		app.focus = null; // a new, unlinked person is outside any focus
		app.select(p.id);
	}
	function setBranch(b: string) {
		app.branch = b;
		app.fitTree();
	}
	function onKey(e: KeyboardEvent) {
		const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
		if (typing || app.showData) return;
		if (e.key === 'Escape' && app.selected) app.select(null);
		else if (e.key === 'f' && app.selected && !e.metaKey && !e.ctrlKey && !e.altKey) app.focusOn(app.selected);
	}
</script>

<svelte:window onkeydown={onKey} onhashchange={onHashChange} />

<header class="top">
	<div class="brand">Family Tree <span>sketchbook</span></div>
	<nav class="tabs">
		{#each tabs as [k, l] (k)}
			<button aria-pressed={app.tab === k} onclick={() => (app.tab = k)}>{l}{#if k === 'todo'}<span class="count">{gapCount(app.data)}</span>{/if}</button>
		{/each}
	</nav>
	<SearchBox />
	<div class="actions">
		<button class="btn" onclick={addNew}>+ New person</button>
		<button class="btn" onclick={() => (app.showData = true)}>Data</button>
	</div>
</header>

<div class="bar">
	{#if app.activeFocus}
		{@const f = app.activeFocus}
		<div class="focusbar" role="group" aria-label="Focus">
			<span>Focused on <button class="linkish" onclick={() => app.centreOn(f.id)}>{displayName(person(app.data, f.id))}</button></span>
			<span class="stepper" title="Generations of ancestors shown">
				<button aria-label="Fewer generations up" disabled={f.up === 0} onclick={() => app.adjustFocus({ up: f.up - 1 })}>−</button><span aria-label="Generations up">↑{f.up}</span><button aria-label="More generations up" onclick={() => app.adjustFocus({ up: f.up + 1 })}>+</button>
			</span>
			<span class="stepper" title="Generations of descendants shown">
				<button aria-label="Fewer generations down" disabled={f.down === 0} onclick={() => app.adjustFocus({ down: f.down - 1 })}>−</button><span aria-label="Generations down">↓{f.down}</span><button aria-label="More generations down" onclick={() => app.adjustFocus({ down: f.down + 1 })}>+</button>
			</span>
			<span class="seg" role="group" aria-label="Who to show">
				{#each WIDTHS as [w, label, hint] (w)}
					<button aria-pressed={f.width === w} title={hint} onclick={() => app.adjustFocus({ width: w })}>{label}</button>
				{/each}
			</span>
			<button class="chip" onclick={() => app.clearFocus()} title="Leave focus and show everyone">✕ Show everyone</button>
		</div>
	{:else if app.branches.length > 1}
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
