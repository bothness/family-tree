<script lang="ts">
	import { app, type Tab } from '#lib/app.svelte.ts';
	import { onMount } from 'svelte';
	import { browserStore } from '#lib/storage/index.ts';
	import { gaps } from '#lib/model/gaps.ts';
	import { childIds, family, partnerIds } from '#lib/model/queries.ts';
	import { newPerson } from '#lib/model/mutations.ts';
	import { DEFAULT_FOCUS, type FocusWidth } from '#lib/model/focus.ts';
	import type { Focus } from '#lib/app.svelte.ts';
	import TreeView from '#lib/components/TreeView.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import TodoView from '#lib/components/TodoView.svelte';
	import PersonSheet from '#lib/components/PersonSheet.svelte';
	import DataDialog from '#lib/components/DataDialog.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';
	import ViewBar from '#lib/components/ViewBar.svelte';
	import BlankPrompt from '#lib/components/BlankPrompt.svelte';

	// Load once (nothing is shown until then, so the sample never flashes up or overwrites saved data), then save
	// shortly after each change. JSON.stringify reads the whole dataset, so the effect tracks it deeply.
	onMount(async () => {
		app.store = await browserStore();
		const saved = await app.store.load().catch(() => null);
		if (saved) app.data = saved;
		app.ready = true;
		app.refreshThumbs();
	});
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let pending: typeof app.data | null = null;
	const flush = () => {
		clearTimeout(saveTimer);
		if (pending) app.store?.save(pending);
		pending = null;
	};
	$effect(() => {
		if (!app.ready) return;
		pending = JSON.parse(JSON.stringify(app.data));
		clearTimeout(saveTimer);
		saveTimer = setTimeout(flush, 250);
	});
	// Don't lose the last edit if the tab is hidden or closed within the save delay.
	onMount(() => {
		const onHide = () => document.visibilityState === 'hidden' && flush();
		document.addEventListener('visibilitychange', onHide);
		addEventListener('pagehide', flush);
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			removeEventListener('pagehide', flush);
		};
	});

	// The open view lives in the page address (#view=…&focus=…&up=…&down=…&w=…), so Back undoes a change,
	// reload keeps it, and a view can be bookmarked.
	interface Place {
		focus: Focus | null;
		view: string | null;
		blank: boolean;
	}
	const WIDTH_KEYS: FocusWidth[] = ['direct', 'siblings', 'all'];
	function readHash(): Place {
		const h = new URLSearchParams(location.hash.slice(1));
		const id = h.get('focus');
		const n = (k: string, dflt: number) => {
			const raw = h.get(k);
			if (raw === 'all') return Infinity;
			const v = Number(raw);
			return raw !== null && Number.isInteger(v) && v >= 0 ? Math.min(v, 50) : dflt;
		};
		const w = h.get('w') as FocusWidth;
		const focus = id ? { id, up: n('up', DEFAULT_FOCUS.up), down: n('down', DEFAULT_FOCUS.down), width: WIDTH_KEYS.includes(w) ? w : DEFAULT_FOCUS.width } : null;
		return { focus, view: h.get('view'), blank: h.has('start') };
	}
	function hashOf({ focus: f, view, blank }: Place) {
		const h = new URLSearchParams();
		if (blank) return '#start';
		if (view) h.set('view', view);
		if (f) {
			h.set('focus', f.id);
			h.set('up', isFinite(f.up) ? `${f.up}` : 'all');
			h.set('down', isFinite(f.down) ? `${f.down}` : 'all');
			h.set('w', f.width);
		}
		return h.size ? `#${h}` : '';
	}
	const here = (): Place => ({ focus: app.focus, view: app.viewId, blank: app.blank });
	const currentHash = () => (location.hash === '#' ? '' : location.hash);
	({ focus: app.focus, view: app.viewId, blank: app.blank } = readHash());
	$effect(() => {
		if (!app.ready) return; // saved data not loaded yet: the focus or view may refer to people in it
		if (app.focus && !app.activeFocus) app.focus = null; // focused person was deleted
		if (app.viewId && !app.activeView) app.viewId = null; // view was deleted
		const h = hashOf(here());
		if (h !== currentHash()) location.hash = h;
	});
	function onHashChange() {
		const p = readHash();
		if (hashOf(p) !== hashOf(here())) {
			({ focus: app.focus, view: app.viewId, blank: app.blank } = p);
			app.fitTree();
		}
	}

	// Like the to-do list itself, the count only covers people in view.
	const todoCount = $derived(Object.entries(gaps(app.data)).reduce((n, [id, g]) => n + (app.inView(id) ? g.length : 0), 0));

	// Start each person's panel at the top, not wherever the previous person's was scrolled to.
	let sheet: HTMLElement | undefined = $state();
	$effect.pre(() => {
		void app.selected;
		if (sheet) sheet.scrollTop = 0;
	});

	const tabs: [Tab, string][] = [['tree', 'Tree'], ['timeline', 'Timeline'], ['map', 'Map'], ['todo', 'Research to-do']];

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
		// A new, unlinked person is outside any focus or view.
		app.blank = false;
		app.focus = null;
		app.viewId = null;
		app.select(p.id);
	}
	function onKey(e: KeyboardEvent) {
		const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
		if (typing || app.showData) return;
		if (e.key === 'Escape' && app.picked) app.cancelPicking();
		else if (e.key === 'Escape' && app.selected) app.select(null);
		else if (e.key === 'f' && app.selected && !e.metaKey && !e.ctrlKey && !e.altKey) app.focusOn(app.selected);
	}
</script>

<svelte:window onkeydown={onKey} onhashchange={onHashChange} />

<header class="top">
	<div class="brand">Family Tree <span>sketchbook</span></div>
	<nav class="tabs">
		{#each tabs as [k, l] (k)}
			<button aria-pressed={app.tab === k} onclick={() => (app.tab = k)}>{l}{#if k === 'todo'}<span class="count">{todoCount}</span>{/if}</button>
		{/each}
	</nav>
	<SearchBox />
	<div class="actions">
		<button class="btn" onclick={addNew}>+ New person</button>
		<button class="btn" onclick={() => (app.showData = true)}>Data</button>
	</div>
</header>

<ViewBar />

<div class="work">
	<main class="main" class:tree={app.tab === 'tree' || app.tab === 'map'}>
		{#if !app.ready}
			<div class="empty">Loading…</div>
		{:else if app.tab === 'tree'}
			<TreeView {onGhost} />
		{:else if app.tab === 'map' && !(app.blank && app.data.people.length)}
			<MapView />
		{:else}
			<div class="pad">
				{#if app.blank && app.data.people.length}
					<BlankPrompt />
				{:else if app.tab === 'timeline'}
					<TimelineView />
				{:else}
					<TodoView onOpen={openPerson} />
				{/if}
			</div>
		{/if}
	</main>
	{#if app.selected && app.data.people.some((p) => p.id === app.selected)}
		<aside class="sheet" bind:this={sheet}>
			{#key app.selected}
				<PersonSheet pid={app.selected} />
			{/key}
		</aside>
	{/if}
</div>

{#if app.showData}
	<DataDialog onClose={() => (app.showData = false)} />
{/if}
