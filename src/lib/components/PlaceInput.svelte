<script lang="ts">
	// The place of a birth or death (G6). As you type it offers places already in the tree, then (after a pause)
	// matches from OpenStreetMap, which bring a map position and Wikidata id; or keeps what you typed as written.
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
	// Show the current place's name whenever the list isn't open.
	$effect(() => {
		const name = current?.name ?? '';
		if (!open) query = name;
	});

	const known = $derived(open ? knownPlaces(d, query).filter((p) => p.id !== current?.id) : []);

	// Online search: only after a pause in typing, cancelled if typing resumes.
	let found = $state<PlaceHit[]>([]);
	let status = $state<'idle' | 'waiting' | 'searching' | 'error'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let ctl: AbortController | undefined;
	function typed(q: string) {
		query = q;
		clearTimeout(timer);
		ctl?.abort();
		found = [];
		if (q.trim().length < 3) return void (status = 'idle');
		status = 'waiting';
		timer = setTimeout(async () => {
			ctl = new AbortController();
			status = 'searching';
			try {
				found = await searchPlaces(q, { signal: ctl.signal });
				status = 'idle';
			} catch (e) {
				if ((e as Error).name !== 'AbortError') status = 'error';
			}
		}, 600);
	}
	// Results already in the tree aren't offered again from OpenStreetMap.
	const fresh = $derived(found.filter((h) => !d.places.some((p) => p.links?.osm === h.osm && (p.id === current?.id || known.includes(p)))));
	const asTyped = $derived(query.trim() && query.trim().toLowerCase() !== (current?.name ?? '').toLowerCase() && !known.some((p) => p.name.toLowerCase() === query.trim().toLowerCase()));

	let chosen = false;
	function choose(v: string) {
		if (!v) return;
		chosen = true;
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
		open = o;
		if (o) return void (chosen = false);
		clearTimeout(timer);
		ctl?.abort();
		status = 'idle';
		setTimeout(() => {
			if (chosen) return void (chosen = false);
			const t = query.trim();
			if (t === (current?.name ?? '')) return;
			if (t) setLife(d, pid, kind, null, t);
			else setLifePlace(d, pid, kind, null);
		}, 0);
	}
</script>

<div class="place-field">
	<Combobox.Root type="single" bind:value {open} {onOpenChange} onValueChange={choose} inputValue={query}>
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
				{#if current && !query.trim()}
					<Combobox.Item value="clear" label="" class="search-item"><span class="aka">No place</span></Combobox.Item>
				{/if}
				{#if status === 'waiting' || status === 'searching'}
					<div class="search-none">Searching OpenStreetMap…</div>
				{:else if status === 'error'}
					<div class="search-none">Couldn't reach OpenStreetMap. You can still keep the place as written.</div>
				{:else if !known.length && !fresh.length && !asTyped}
					<div class="search-none">{query.trim().length < 3 ? 'Type a place name' : 'No matches'}</div>
				{/if}
				{#if fresh.length}<div class="pop-foot">Search by Nominatim · {ATTRIBUTION}</div>{/if}
			</Combobox.Content>
		</Combobox.Portal>
	</Combobox.Root>
	{#if current}
		<PlaceDetails place={current} />
	{/if}
</div>
