<script lang="ts">
	// Map view (V12): a MapLibre globe with OpenFreeMap vector tiles, showing where people in view were born and
	// died. Filtered by the current focus or saved view, like every other tab. MapLibre loads only when the map
	// tab is opened.
	import { onMount, untrack } from 'svelte';
	import type { Map as MlMap, Popup, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	// MapLibre draws tiles in a web worker; tell it where Vite put the worker file (needed in dev and build).
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
	import { app } from '#lib/app.svelte.ts';
	import { boundsOf, mapData, toGeoJSON } from '#lib/layout/map.ts';

	const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
	const data = $derived(mapData(app.data, app.visibleIds));

	let box: HTMLDivElement | undefined = $state();
	let map: MlMap | undefined;
	let popup: Popup | undefined;
	let lib: typeof import('maplibre-gl') | undefined;
	let failed = $state('');
	let ready = $state(false);

	// Same rule as the colour tokens in app.css: data-theme="dark"/"light" wins, else the system setting.
	const dark = () => {
		const t = document.documentElement.dataset.theme;
		return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
	};
	const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2c6b5b';

	/** Our layers, added again whenever the style (light/dark) loads. */
	function addLayers() {
		if (!map) return;
		map.setProjection({ type: 'globe' });
		map.addSource('places', { type: 'geojson', data: toGeoJSON(data) });
		map.addLayer({
			id: 'place-dots',
			type: 'circle',
			source: 'places',
			paint: {
				'circle-color': token('--accent'),
				'circle-opacity': 0.85,
				'circle-stroke-color': token('--sheet'),
				'circle-stroke-width': 1.5,
				'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 2, 9, 20, 16]
			}
		});
		// How many births and deaths, inside the dot (the base map already names the towns).
		map.addLayer({
			id: 'place-counts',
			type: 'symbol',
			source: 'places',
			filter: ['>', ['get', 'count'], 1],
			layout: { 'text-field': ['to-string', ['get', 'count']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true },
			paint: { 'text-color': token('--sheet') }
		});
		ready = true;
	}

	function fitToPlaces(animate = true) {
		const b = boundsOf(data);
		if (!map || !b) return;
		if (b[0][0] === b[1][0] && b[0][1] === b[1][1]) map.easeTo({ center: b[0], zoom: 6, duration: animate ? 600 : 0 });
		else map.fitBounds(b, { padding: 80, maxZoom: 8, duration: animate ? 800 : 0 });
	}

	/** The list of births and deaths at a place, with names that open the person. */
	function showPlace(e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
		const id = e.features?.[0]?.properties.placeId as string | undefined;
		const p = data.places.find((x) => x.placeId === id);
		if (!p || !map || !lib) return;
		const el = document.createElement('div');
		el.className = 'map-pop';
		const h = el.appendChild(document.createElement('div'));
		h.className = 'map-pop-head';
		h.textContent = p.name;
		if (p.context) {
			const c = el.appendChild(document.createElement('div'));
			c.className = 'hint';
			c.textContent = p.context;
		}
		const ul = el.appendChild(document.createElement('ul'));
		for (const ev of p.events) {
			const li = ul.appendChild(document.createElement('li'));
			li.append(`${ev.kind === 'birth' ? 'Born' : 'Died'}${ev.date ? ` ${ev.date}` : ''}: `);
			const b = li.appendChild(document.createElement('button'));
			b.className = 'linkish';
			b.textContent = ev.name;
			b.onclick = () => app.select(ev.personId);
		}
		popup?.remove();
		popup = new lib.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(el).addTo(map);
	}

	onMount(() => {
		let gone = false;
		(async () => {
			try {
				lib = await import('maplibre-gl');
				if (gone || !box) return;
				lib.setWorkerUrl(workerUrl);
				map = new lib.Map({ container: box, style: dark() ? STYLE.dark : STYLE.light, center: [-3, 54], zoom: 1.6, attributionControl: { compact: true } });
				map.addControl(new lib.NavigationControl({ showCompass: false }), 'bottom-right');
				map.on('style.load', addLayers);
				map.once('load', () => fitToPlaces(false));
				map.on('click', 'place-dots', showPlace);
				map.on('mouseenter', 'place-dots', () => (map!.getCanvas().style.cursor = 'pointer'));
				map.on('mouseleave', 'place-dots', () => (map!.getCanvas().style.cursor = ''));
				map.on('error', (e) => console.warn('[map]', e.error?.message ?? e));
			} catch (e) {
				failed = (e as Error).message || 'The map could not start.';
			}
		})();
		const mq = matchMedia('(prefers-color-scheme: dark)');
		// A full style reload (not a diff), so 'style.load' fires and our layers are added again.
		const onTheme = () => map?.setStyle(dark() ? STYLE.dark : STYLE.light, { diff: false });
		mq.addEventListener('change', onTheme);
		return () => {
			gone = true;
			mq.removeEventListener('change', onTheme);
			popup?.remove();
			map?.remove();
		};
	});

	// Keep the dots up to date; re-frame the map when who's in view changes (not on every edit).
	let lastIds = '';
	$effect(() => {
		const g = toGeoJSON(data);
		const ids = app.visibleIds.join();
		if (!ready) return;
		untrack(() => {
			(map?.getSource('places') as GeoJSONSource | undefined)?.setData(g);
			if (ids !== lastIds) {
				if (lastIds) fitToPlaces();
				lastIds = ids;
			}
		});
	});
</script>

<div class="mapwrap">
	<div class="map" bind:this={box}></div>
	{#if failed}
		<div class="empty">Couldn't show the map: {failed}</div>
	{/if}
	<div class="map-note">
		{#if data.places.length}
			<span>{data.places.length} {data.places.length === 1 ? 'place' : 'places'} on the map</span>
		{:else}
			<span>No places with a map position for the people in view yet.</span>
		{/if}
		{#if data.unmapped.length}
			<span class="hint" title={data.unmapped.map((u) => u.name).join(', ')}>
				· {data.unmapped.length} written by hand, not shown ({data.unmapped.slice(0, 3).map((u) => u.name).join(', ')}{data.unmapped.length > 3 ? '…' : ''}): open a place and choose "Find on the map".
			</span>
		{/if}
		{#if data.places.length}<button class="linkish" onclick={() => fitToPlaces()}>Show all places</button>{/if}
	</div>
</div>
