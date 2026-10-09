<script lang="ts">
	// The place of a birth or death (G6). As you type it offers places already in the tree, or keeps what you typed
	// as written. OpenStreetMap is searched only when you ask ("Search OpenStreetMap for …"): Nominatim's usage
	// policy forbids search-as-you-type on its public service. Its matches bring a map position and Wikidata id.
	import { Combobox } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import { lifeEvent } from '#lib/model/queries.ts';
	import { setLife } from '#lib/model/mutations.ts';
	import { isLinked, knownPlaces, placeFromLookup, setLifePlace } from '#lib/model/places.ts';
	import { ATTRIBUTION, searchPlaces, type PlaceHit } from '#lib/places/nominatim.ts';
	import PlaceDetails from './PlaceDetails.svelte';

	let { pid, kind }: { pid: string; kind: 'birth' | 'death' } = $props();

	const d = $derived(app.data);
	const current = $derived.by(() => {
		const id = lifeEvent(d, pid, kind)?.place?.placeId;
		return id ? d.places.find((p) => p.id === id) : undefined;
	});
	let query = $state('');
	let open = $state(false);
	let value = $state('');
	// Show the current place's name whenever the list isn't open (but not while an online search is running:
	// choosing "Search OpenStreetMap" closes the list for a moment, and what was typed must survive that).
	let searching = $state(false);
	$effect(() => {
		const name = current?.name ?? '';
		if (!open && !searching) query = name;
	});

	const known = $derived(open ? knownPlaces(d, query).filter((p) => p.id !== current?.id) : []);

	// Online search: only when asked for, for what's typed at that moment.
	let found = $state<PlaceHit[]>([]);
	let searchedFor = $state('');
	let status = $state<'idle' | 'searching' | 'error'>('idle');
	let ctl: AbortController | undefined;
	function typed(q: string) {
		query = q;
		if (q.trim().toLowerCase() !== searchedFor.toLowerCase()) found = [];
	}
	// Results can appear (instantly, if cached) right under the pointer that chose "Search": ignore picks of a
	// result for a moment, so the same click can't choose one.
	let resultsSince = 0;
	async function searchOnline() {
		const q = query.trim();
		searching = true;
		ctl?.abort();
		ctl = new AbortController();
		status = 'searching';
		searchedFor = q;
		open = true; // keep the list open to show progress, then the matches
		try {
			found = await searchPlaces(q, { signal: ctl.signal });
			status = 'idle';
		} catch (e) {
			if ((e as Error).name !== 'AbortError') status = 'error';
		}
		query = q;
		resultsSince = Date.now();
		setTimeout(() => ((open = true), (searching = false)), 0);
	}
	const canSearch = $derived(query.trim().length >= 2 && query.trim().toLowerCase() !== searchedFor.toLowerCase());
	// Results already in the tree aren't offered again from OpenStreetMap.
	const fresh = $derived(found.filter((h) => !d.places.some((p) => p.links?.osm === h.osm && (p.id === current?.id || known.includes(p)))));
	const asTyped = $derived(query.trim() && query.trim().toLowerCase() !== (current?.name ?? '').toLowerCase() && !known.some((p) => p.name.toLowerCase() === query.trim().toLowerCase()));

	let chosen = false;
	function choose(v: string) {
		if (!v) return;
		chosen = true;
		if (v.startsWith('osm:') && Date.now() - resultsSince < 400) {
			// Ignored: keep the list open with the results and the typed text.
			value = '';
			searching = true;
			setTimeout(() => ((open = true), (searching = false)), 10);
			return;
		}
		if (v === 'search') {
			value = ''; // `chosen` stays set, so the typed text isn't saved as written meanwhile
			return void searchOnline();
		}
		if (v.startsWith('known:')) setLifePlace(d, pid, kind, v.slice(6));
		else if (v.startsWith('osm:')) setLifePlace(d, pid, kind, placeFromLookup(d, fresh[Number(v.slice(4))]));
		else if (v === 'text') setLife(d, pid, kind, null, query);
		else if (v === 'clear') setLifePlace(d, pid, kind, null);
		value = '';
		query = current?.name ?? '';
		open = false;
	}
	// Closing without choosing keeps what was typed, as a plain field would. Wait a tick, since the list may close
	// just before the choice is reported.
	function onOpenChange(o: boolean) {
		// Stay open while an online search runs (re-opened on the next tick, after Bits has finished closing).
		if (!o && searching) return void setTimeout(() => (open = true), 0);
		open = o;
		if (o) return void (chosen = false);
		ctl?.abort();
		status = 'idle';
		setTimeout(() => {
			if (searching) return;
			if (chosen) return void (chosen = false);
			const t = query.trim();
			if (t === (current?.name ?? '')) return;
			if (t) setLife(d, pid, kind, null, t);
			else setLifePlace(d, pid, kind, null);
		}, 0);
	}
</script>

<div class="place-field">
	<Combobox.Root type="single" bind:value bind:open {onOpenChange} onValueChange={choose} inputValue={query}>
		<Combobox.Input class="place-input" placeholder="Town or parish" autocomplete="off" oninput={(e) => typed(e.currentTarget.value)} aria-label="Place" />
		<Combobox.Portal>
			<Combobox.Content class="search-pop place-pop" sideOffset={4} align="start">
				{#if known.length}
					<Combobox.Group>
						<Combobox.GroupHeading class="pop-head">In your tree</Combobox.GroupHeading>
						{#each known as p (p.id)}
							<Combobox.Item value="known:{p.id}" label={p.name} class="search-item">
								<span class="nm">{p.name}</span>{#if p.context}<span class="aka">{p.context}</span>{/if}
								{#if isLinked(p)}<span class="yr" title="On the map">●</span>{/if}
							</Combobox.Item>
						{/each}
					</Combobox.Group>
				{/if}
				{#if fresh.length}
					<Combobox.Group>
						<Combobox.GroupHeading class="pop-head">OpenStreetMap</Combobox.GroupHeading>
						{#each fresh as h, i (h.osm)}
							<Combobox.Item value="osm:{i}" label={h.name} class="search-item">
								<span class="nm">{h.name}</span>{#if h.context}<span class="aka">{h.context}</span>{/if}
								<span class="yr">{h.type}</span>
							</Combobox.Item>
						{/each}
					</Combobox.Group>
				{/if}
				{#if asTyped}
					<Combobox.Item value="text" label={query} class="search-item">
						<span class="aka">Keep</span><span class="nm">“{query.trim()}”</span><span class="aka">as written</span>
					</Combobox.Item>
				{/if}
				{#if canSearch}
					<Combobox.Item value="search" label={query} class="search-item">
						<span class="aka">Search OpenStreetMap for</span><span class="nm">“{query.trim()}”</span>
					</Combobox.Item>
				{/if}
				{#if current && !query.trim()}
					<Combobox.Item value="clear" label="" class="search-item"><span class="aka">No place</span></Combobox.Item>
				{/if}
				{#if status === 'searching'}
					<div class="search-none">Searching OpenStreetMap…</div>
				{:else if status === 'error'}
					<div class="search-none">Couldn't reach OpenStreetMap. You can still keep the place as written.</div>
				{:else if searchedFor && !fresh.length && query.trim().toLowerCase() === searchedFor.toLowerCase()}
					<div class="search-none">No matches on OpenStreetMap.</div>
				{:else if !known.length && !asTyped && !canSearch}
					<div class="search-none">Type a place name</div>
				{/if}
				{#if fresh.length}<div class="pop-foot">Search by Nominatim · {ATTRIBUTION}</div>{/if}
			</Combobox.Content>
		</Combobox.Portal>
	</Combobox.Root>
	{#if current}
		<PlaceDetails place={current} />
	{/if}
</div>
