<script lang="ts">
	// Map view (V12): a MapLibre globe with OpenFreeMap vector tiles, showing where people in view were born and
	// died. Filtered by the current focus or saved view, like every other tab. MapLibre loads only when the map
	// tab is opened. Places close together on screen are grouped (a click zooms in until they part); an open place
	// has lines to where the people born there died, or those who died there were born.
	import { onMount, untrack } from 'svelte';
	import type { Map as MlMap, Popup, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature, ExpressionSpecification } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	// MapLibre draws tiles in a web worker; tell it where Vite put the worker file (needed in dev and build).
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
	import { app } from '#lib/app.svelte.ts';
	import { boundsOf, CLUSTER_MAX_ZOOM, clusterPlaces, mapData, placeLinks, toGeoJSON, type MapLink } from '#lib/layout/map.ts';

	const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
	const data = $derived(mapData(app.data, app.visibleIds));
	const clusters = $derived(clusterPlaces(data));
	/** The whole zoom level the groups are drawn for. */
	let level = $state(0);
	/** The open place (its list showing) and its lines. */
	let open = $state<string | null>(null);
	let links: MapLink[] = [];

	let box: HTMLDivElement | undefined = $state();
	let map: MlMap | undefined;
	let popup: Popup | undefined;
	let hoverTip: Popup | undefined;
	let lib: typeof import('maplibre-gl') | undefined;
	let failed = $state('');
	let ready = $state(false);

	// Same rule as the colour tokens in app.css: data-theme="dark"/"light" wins, else the system setting.
	const dark = () => {
		const t = document.documentElement.dataset.theme;
		return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
	};
	const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2c6b5b';

	/** A dot's radius for its number of events, scaled by `k`. */
	const dotSize = (k: number): ExpressionSpecification => ['interpolate', ['linear'], ['get', 'count'], 1, 6 * k, 2, 9 * k, 20, 16 * k];

	/** Our layers, added again whenever the style (light/dark) loads. */
	function addLayers() {
		if (!map) return;
		map.setProjection({ type: 'globe' });
		// No national or state borders or names: they've changed a lot over the years a tree covers. Towns and
		// cities stay named.
		for (const l of map.getStyle().layers)
			if ('source-layer' in l && (l['source-layer'] === 'boundary' || (l['source-layer'] === 'place' && /country|state/.test(l.id)))) map.removeLayer(l.id);
		// Lines from the open place, under the dots: wider for more people; a wider invisible line takes the hover.
		map.addSource('links', { type: 'geojson', data: linksGeoJSON() });
		const width: ExpressionSpecification = ['min', 14, ['*', 1.6, ['get', 'n']]];
		map.addLayer({ id: 'link-lines', type: 'line', source: 'links', layout: { 'line-cap': 'round' }, paint: { 'line-color': token('--accent'), 'line-opacity': 0.75, 'line-width': width } });
		map.addLayer({ id: 'link-hit', type: 'line', source: 'links', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': ['+', 12, width] } });
		map.addSource('places', { type: 'geojson', data: toGeoJSON(clusters[level]) });
		const group: ExpressionSpecification = ['>', ['get', 'places'], 1];
		map.addLayer({
			id: 'place-dots',
			type: 'circle',
			source: 'places',
			paint: {
				'circle-color': token('--accent'),
				'circle-opacity': 0.85,
				// A group of places has a soft ring round it.
				'circle-stroke-color': ['case', group, token('--accent'), token('--sheet')],
				'circle-stroke-width': ['case', group, 5, 1.5],
				'circle-stroke-opacity': ['case', group, 0.35, 1],
				// Bigger with more events, and as you zoom in (about twice the size at street level).
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, dotSize(1), 9, dotSize(1.5), 14, dotSize(2.2)]
			}
		});
		// How many people, inside the dot (the base map already names the towns).
		map.addLayer({
			id: 'place-counts',
			type: 'symbol',
			source: 'places',
			filter: ['>', ['get', 'count'], 1],
			layout: { 'text-field': ['to-string', ['get', 'count']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 9, 14, 14, 18], 'text-allow-overlap': true, 'text-ignore-placement': true },
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

	const linksGeoJSON = () => ({
		type: 'FeatureCollection' as const,
		features: links.map((l, i) => ({ type: 'Feature' as const, properties: { i, n: l.people.length }, geometry: { type: 'LineString' as const, coordinates: [l.from, l.to] } }))
	});
	function setLinks(placeId: string | null) {
		open = placeId;
		links = placeId ? placeLinks(app.data, app.visibleIds, placeId) : [];
		(map?.getSource('links') as GeoJSONSource | undefined)?.setData(linksGeoJSON());
	}

	/** A click on a dot: a group zooms in until it parts; a single place shows its list. */
	function clickDot(e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
		const key = e.features?.[0]?.properties.key as string | undefined;
		const c = clusters[level]?.find((x) => x.placeIds.join() === key);
		if (!c || !map) return;
		if (c.placeIds.length > 1) map.easeTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), Math.min(c.splitsAt, CLUSTER_MAX_ZOOM + 1) + 0.3), duration: 600 });
		else showPlace(c.placeIds[0]);
	}

	/** The list of births and deaths at a place, with names that open the person, and its lines. */
	function showPlace(id: string) {
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
			li.append(`${ev.kind === 'birth' ? 'Born' : ev.kind === 'death' ? 'Died' : ev.kind === 'marriage' ? 'Married' : 'Partners'}${ev.date ? ` ${ev.date}` : ''}: `);
			const b = li.appendChild(document.createElement('button'));
			b.className = 'linkish';
			b.textContent = ev.name;
			b.onclick = () => app.select(ev.personId);
		}
		popup?.remove();
		popup = new lib.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat([p.lon, p.lat]).setDOMContent(el).addTo(map);
		const mine = popup;
		mine.on('close', () => popup === mine && setLinks(null));
		setLinks(id);
	}

	/** Hovering a line: who it joins, with where and when each was born and died. */
	function showLink(e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
		const l = links[e.features?.[0]?.properties.i as number];
		if (!l || !map || !lib) return;
		const el = document.createElement('div');
		el.className = 'map-tip-body';
		if (l.people.length > 1) el.appendChild(document.createElement('b')).textContent = `${l.people.length} people`;
		for (const p of l.people) {
			const who = el.appendChild(document.createElement('div'));
			who.className = 'who';
			who.appendChild(document.createElement('b')).textContent = p.name;
			who.appendChild(document.createElement('span')).textContent = `Born ${p.born}`;
			who.appendChild(document.createElement('span')).textContent = `Died ${p.died}`;
		}
		hoverTip ??= new lib.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip', maxWidth: '300px', offset: 10 });
		hoverTip.setLngLat(e.lngLat).setDOMContent(el).addTo(map);
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
				map.on('click', 'place-dots', clickDot);
				map.on('zoom', () => (level = Math.max(0, Math.min(CLUSTER_MAX_ZOOM + 1, Math.floor(map!.getZoom())))));
				map.on('mousemove', 'link-hit', (e) => {
					map!.getCanvas().style.cursor = 'default';
					showLink(e);
				});
				map.on('mouseleave', 'link-hit', () => {
					map!.getCanvas().style.cursor = '';
					hoverTip?.remove();
				});
				// A click on the map away from any place closes the person panel.
				map.on('click', (e) => {
					if (!map!.queryRenderedFeatures(e.point, { layers: ['place-dots'] }).length && app.selected) app.select(null);
				});
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
			hoverTip?.remove();
			map?.remove();
		};
	});

	// Keep the dots (and an open place's lines) up to date; re-frame the map when who's in view changes (not on
	// every edit).
	let lastIds = '';
	$effect(() => {
		const g = toGeoJSON(clusters[level] ?? []);
		const ids = app.visibleIds.join();
		if (!ready) return;
		untrack(() => {
			(map?.getSource('places') as GeoJSONSource | undefined)?.setData(g);
			if (open) setLinks(open);
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
