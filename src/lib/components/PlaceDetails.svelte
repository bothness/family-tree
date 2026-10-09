<script lang="ts">
	// A place's details under the place field: the wider area, and a small editor for its name, former names
	// (e.g. Kingstown before 1920), links and map position (G6).
	import { Popover } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import type { Place } from '#lib/model/types.ts';
	import { fmtDate, parseUserDate } from '#lib/model/edtf.ts';
	import { isLinked, linkPlace, placeUses, unlinkPlace } from '#lib/model/places.ts';
	import { ATTRIBUTION, searchPlaces, type PlaceHit } from '#lib/places/nominatim.ts';

	let { place }: { place: Place } = $props();

	const uses = $derived(placeUses(app.data, place.id));
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	function setName(v: string) {
		if (v.trim()) place.name = v.trim();
	}
	function setContext(v: string) {
		if (v.trim()) place.context = v.trim();
		else delete place.context;
	}
	function addFormer() {
		if (!place.altNames) place.altNames = [];
		place.altNames.push({ name: '' }); // push onto the stored ($state) list, not a fresh array
	}
	function setFormer(i: number, k: 'name' | 'period', v: string) {
		const a = place.altNames![i];
		if (k === 'name') a.name = v.trim();
		else if (v.trim()) a.period = parseUserDate(v);
		else delete a.period;
	}
	// Find a hand-written place on the map: links this place itself, so every event using it is updated.
	let findText = $state('');
	let finding = $state<'idle' | 'searching' | 'error'>('idle');
	let finds = $state<PlaceHit[]>([]);
	async function find(e: SubmitEvent) {
		e.preventDefault();
		finding = 'searching';
		try {
			finds = await searchPlaces(findText || place.name);
			finding = 'idle';
		} catch {
			finding = 'error';
		}
	}
	function removeFormer(i: number) {
		place.altNames!.splice(i, 1);
		if (!place.altNames!.length) delete place.altNames;
	}
</script>

<div class="place-meta">
	{#if place.context}<span>{place.context}</span>{/if}
	{#if isLinked(place)}<span class="on-map" title="This place has a map position">● on the map</span>{:else}<span class="hint">written by hand</span>{/if}
	<Popover.Root>
		<Popover.Trigger class="linkish place-edit" aria-label="Edit place details">Edit place</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content class="pop place-details" sideOffset={6} align="end">
				{#if uses > 1}<p class="hint">Used for {uses} events: changes apply to all of them.</p>{/if}
				<label class="fld"><span>Name</span><input type="text" value={place.name} onchange={(e) => setName(val(e))} /></label>
				<label class="fld"><span>Wider area</span><input type="text" value={place.context ?? ''} placeholder="e.g. West Yorkshire, England" onchange={(e) => setContext(val(e))} /></label>
				<div class="lbl">Former or other names</div>
				{#each place.altNames ?? [] as a, i (i)}
					<div class="row">
						<input type="text" value={a.name} placeholder="e.g. Kingstown" aria-label="Former name" style="flex:2 1 120px" onchange={(e) => setFormer(i, 'name', val(e))} />
						<input type="text" value={fmtDate(a.period)} placeholder="e.g. before 1920" aria-label="When" style="flex:1 1 90px" onchange={(e) => setFormer(i, 'period', val(e))} />
						<button class="del" type="button" aria-label="Remove" onclick={() => removeFormer(i)}>×</button>
					</div>
				{/each}
				<div><button class="btn small" type="button" onclick={addFormer}>+ Former name</button></div>
				{#if !isLinked(place)}
					<div class="lbl">Find on the map</div>
					<form class="row" onsubmit={find}>
						<input type="text" bind:value={findText} placeholder={place.name} aria-label="Search OpenStreetMap" style="flex:1 1 140px" />
						<button class="btn small" type="submit">{finding === 'searching' ? 'Searching…' : 'Search'}</button>
					</form>
					{#if finding === 'error'}<p class="hint">Couldn't reach OpenStreetMap.</p>{/if}
					{#if finds.length}
						<div class="results">
							{#each finds as h (h.osm)}
								<button type="button" onclick={() => ((finds = []), linkPlace(place, h))}>{h.name}<span class="yr">{h.context}</span></button>
							{/each}
						</div>
						<p class="hint">{ATTRIBUTION}</p>
					{/if}
				{:else}
					<div class="lbl">Links</div>
					<div class="row hint">
						{#if place.coordinates}<span>{place.coordinates.lat.toFixed(4)}, {place.coordinates.lon.toFixed(4)}</span>{/if}
						{#if place.links?.osm}<a href="https://www.openstreetmap.org/{place.links.osm}" target="_blank" rel="noopener">OpenStreetMap</a>{/if}
						{#if place.links?.wikidata}<a href="https://www.wikidata.org/wiki/{place.links.wikidata}" target="_blank" rel="noopener">Wikidata {place.links.wikidata}</a>{/if}
					</div>
					<div><button class="btn small" type="button" onclick={() => unlinkPlace(place)} title="Keep the name but remove the map position and links">Unlink from the map</button></div>
				{/if}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
</div>
