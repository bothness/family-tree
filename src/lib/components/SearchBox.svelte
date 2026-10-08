<script lang="ts">
	import { tick } from 'svelte';
	import { Combobox } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import { cardDates, displayName, nameIsGuess, person, searchPeople } from '#lib/model/queries.ts';

	let query = $state('');
	let value = $state('');
	let input: HTMLInputElement | null = $state(null);

	const hits = $derived(query.trim() ? searchPeople(app.data, query, { limit: 8 }) : []);
	const items = $derived(hits.map((h) => ({ value: h.id, label: displayName(person(app.data, h.id)) })));

	async function choose(id: string) {
		if (!id) return;
		app.centreOn(id);
		input?.blur();
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
			input?.focus();
			input?.select();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="search">
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
		/>
		<Combobox.Portal>
			<Combobox.Content class="search-pop" sideOffset={4} align="start">
				{#each hits as h (h.id)}
					{@const p = person(app.data, h.id)}
					<Combobox.Item value={h.id} label={displayName(p)} class="search-item">
						<span class="nm" class:pencil={p && nameIsGuess(p)}>{displayName(p)}</span>
						{#if h.alsoKnownAs}<span class="aka">({h.alsoKnownAs})</span>{/if}
						<span class="yr">{cardDates(app.data, h.id)}</span>
					</Combobox.Item>
				{:else}
					<div class="search-none">{query.trim() ? 'No one matches' : 'Type a name'}</div>
				{/each}
			</Combobox.Content>
		</Combobox.Portal>
	</Combobox.Root>
</div>
