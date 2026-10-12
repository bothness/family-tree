<script lang="ts">
	import { flushSync, tick } from 'svelte';
	import { Combobox } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import { cardDates, displayName, nameIsGuess, person, searchPeople } from '#lib/model/queries.ts';

	let query = $state('');
	let value = $state('');
	let input: HTMLInputElement | null = $state(null);
	// Phones: the box is hidden behind a magnifier until it's tapped, and goes again once someone is chosen.
	let open = $state(false);
	function toggle() {
		flushSync(() => (open = !open)); // show it now, so focusing brings up the keyboard on iOS
		if (open) input?.focus();
	}

	const hits = $derived(query.trim() ? searchPeople(app.data, query, { limit: 8 }) : []);
	const items = $derived(hits.map((h) => ({ value: h.id, label: displayName(person(app.data, h.id)) })));

	async function choose(id: string) {
		if (!id) return;
		if (app.blank) {
			// Starting from an empty canvas: there's nothing to centre in, so focus on them.
			app.focusOn(id);
			app.select(id);
		} else if (app.picked) {
			app.togglePicked(id); // picking people for a view: search adds them
			app.centreTarget = id;
		} else if (app.activeFocus && !app.inView(id)) {
			// Hidden by the current focus: open their panel (which offers "Show in full tree" / "Focus on them")
			// rather than silently leaving the focus.
			app.select(id);
		} else app.centreOn(id);
		input?.blur();
		open = false;
		// Clear so the box is ready for the next search (and the same person can be picked again).
		// Bits fills in the chosen name after this handler, so wait a tick before clearing.
		await tick();
		query = '';
		value = '';
	}

	// "/" or ⌘K / Ctrl+K jumps to the search box.
	function onKey(e: KeyboardEvent) {
		const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
		if ((e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
			e.preventDefault();
			flushSync(() => (open = true));
			input?.focus();
			input?.select();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<button class="ibtn search-toggle" aria-label="Find a person" aria-pressed={open} onclick={toggle}>
	<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
</button>
<div class="search" class:open>
	<Combobox.Root type="single" bind:value onValueChange={choose} {items} inputValue={query}>
		<Combobox.Input
			bind:ref={input}
			class="search-input"
			type="search"
			placeholder="Find a person"
			aria-label="Find a person"
			title="Find a person (/ or ⌘K)"
			autocomplete="off"
			oninput={(e) => (query = e.currentTarget.value)}
			onkeydown={(e) => e.key === 'Escape' && !query && (open = false)}
		/>
		<Combobox.Portal>
			<Combobox.Content class="search-pop" sideOffset={4} align="start">
				{#each hits as h (h.id)}
					{@const p = person(app.data, h.id)}
					<Combobox.Item value={h.id} label={displayName(p)} class="search-item">
						<span class="nm" class:pencil={p && nameIsGuess(p)}>{displayName(p)}</span>
						{#if h.alsoKnownAs}<span class="aka">({h.alsoKnownAs})</span>{/if}
						{#if app.activeFocus && !app.inView(h.id)}<span class="out">not in view</span>{/if}
						<span class="yr">{cardDates(app.data, h.id)}</span>
					</Combobox.Item>
				{:else}
					<div class="search-none">{query.trim() ? 'No one matches' : 'Type a name'}</div>
				{/each}
			</Combobox.Content>
		</Combobox.Portal>
	</Combobox.Root>
</div>
