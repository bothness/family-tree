<script lang="ts">
	import { app, demoData } from '#lib/app.svelte.ts';
	import { emptyDataset } from '#lib/model/mutations.ts';
	import { makeBackup, pruneMedia, readBackup } from '#lib/storage/index.ts';
	import { ago } from '#lib/storage/safety.ts';
	import { toGedcom } from '#lib/export/gedcom.ts';
	import { isZip, makeZip, readZip } from '#lib/export/zip.ts';

	let { onClose }: { onClose: () => void } = $props();
	/** Family edition: the tree is shared, so replacing all of it (a backup, pasted data, starting empty) is for
	 *  owners only, and the demo isn't offered. */
	const shared = __SYNC__;
	const canReplace = $derived(!shared || app.user?.role === 'owner');

	let text = $state(JSON.stringify($state.snapshot(app.data), null, 2));
	let err = $state('');
	let copied = $state(false);
	let armed = $state<'' | 'reset' | 'clear'>('');

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			err = 'Copy failed – select the text and copy it manually.';
		}
	}
	/** Put new data in place, and delete photo files it no longer refers to. */
	function useData(d: typeof app.data) {
		app.replaceData(d);
		app.select(null);
		app.showEveryone();
		if (app.store) pruneMedia(app.store, d);
		onClose();
	}
	async function load(from = text) {
		try {
			if (!app.store) throw new Error('storage is not ready yet.');
			useData(await readBackup(app.store, from));
		} catch (e) {
			err = "Couldn't load that: " + (e as Error).message;
		}
	}
	function replace(kind: 'reset' | 'clear') {
		if (armed !== kind) {
			armed = kind;
			return;
		}
		useData(kind === 'reset' ? demoData() : emptyDataset());
	}

	// Downloads: the backup (one JSON file with everything, photos included), a GEDCOM file for other apps, and a
	// ZIP with all of it (the data, GEDCOM and the photos as files). The backup and the ZIP count as backups.
	let saving = $state<'' | 'json' | 'ged' | 'zip'>('');
	function save(blob: Blob, ext: string) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.${ext}`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	async function download(kind: 'json' | 'ged' | 'zip') {
		if (!app.store || saving) return;
		saving = kind;
		err = '';
		try {
			const d = $state.snapshot(app.data);
			if (kind === 'json') save(new Blob([await makeBackup(app.store, d)], { type: 'application/json' }), 'json');
			else if (kind === 'ged') save(new Blob([toGedcom(d)], { type: 'text/plain;charset=utf-8' }), 'ged');
			else save(new Blob([(await makeZip(app.store, d)).slice()], { type: 'application/zip' }), 'zip');
			if (kind !== 'ged') app.noteBackup();
		} catch (e) {
			err = "Couldn't make that file: " + (e as Error).message;
		} finally {
			saving = '';
		}
	}
	let fileInput: HTMLInputElement | undefined = $state();
	async function openFile(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		if (!f) return;
		const bytes = new Uint8Array(await f.arrayBuffer());
		if (!isZip(bytes)) return load(new TextDecoder().decode(bytes));
		try {
			if (!app.store) throw new Error('storage is not ready yet.');
			useData(await readZip(app.store, bytes));
		} catch (e) {
			err = "Couldn't open that: " + (e as Error).message;
		}
	}
</script>

<div class="overlay">
	<div class="dialog" role="dialog" aria-label="Your data">
		<div class="row"><div class="lbl" style="font-size:14px">Your data (JSON, schema v0.2)</div><button class="btn small" style="margin-left:auto" onclick={onClose}>Close</button></div>
		{#if shared}
			<p class="hint" style="margin:0">
				This is the family's shared tree: it's kept on the server for everyone invited, with a copy in this browser so it
				works offline. You can still <b>download a backup</b> (it includes photos), or export it for other apps.
				{#if canReplace}As an owner you can also replace the whole shared tree with a backup, for everyone.{/if}
			</p>
		{:else}
			<p class="hint" style="margin:0">
				Your tree is saved in this browser only, on this device, and isn't uploaded anywhere (the only things sent
				out are place names you search for, to OpenStreetMap, and requests for map tiles and fonts). Clearing the
				browser's data deletes it, so <b>download a backup</b> now and then (it includes photos). You can also copy the data
				below, or paste data here (including from the prototype) and load it.
			</p>
		{/if}
		{#if !shared}
		<p class="hint safety" style="margin:0">
			Last backup: <b>{app.backedUpAt ? ago(app.backedUpAt, Date.now()) : 'never'}</b>{#if app.backedUpAt && app.unbackedSince}, with changes since{/if}.
			{#if app.kept === 'yes'}
				This browser has agreed to keep your tree until you clear its data.
			{:else}
				Browsers can clear saved data to free up space (Safari also after a week or so without a visit), so a
				backup is the safe copy.
			{/if}
		</p>
		{/if}
		<div class="row">
			<button class="btn small primary" onclick={() => download('json')} disabled={!!saving}>{saving === 'json' ? 'Preparing…' : 'Download backup'}</button>
			{#if canReplace}<button class="btn small" onclick={() => fileInput?.click()}>{shared ? 'Replace the shared tree with a backup…' : 'Open backup file…'}</button>{/if}
			<input bind:this={fileInput} type="file" accept="application/json,.json,application/zip,.zip" hidden onchange={openFile} />
		</div>
		<div class="lbl">For other family tree apps</div>
		<div class="row">
			<button class="btn small" onclick={() => download('ged')} disabled={!!saving}>{saving === 'ged' ? 'Preparing…' : 'Export GEDCOM (.ged)'}</button>
			<button class="btn small" onclick={() => download('zip')} disabled={!!saving}>{saving === 'zip' ? 'Preparing…' : 'Export ZIP, with photos'}</button>
		</div>
		<p class="hint" style="margin:0">
			GEDCOM is the format other family tree apps and sites (Ancestry, FamilySearch, Gramps, MacFamilyTree…) import.
			Names, dates, places, families, notes and sources carry over. How sure each fact is, research notes, to-dos and
			tags become notes; saved views don't carry over. The ZIP holds the GEDCOM file, the photos, and your full data
			(which this app can open again, so it counts as a backup).
		</p>
		<textarea spellcheck="false" bind:value={text}></textarea>
		<div class="row">
			<button class="btn small" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
			{#if canReplace}<button class="btn small" onclick={() => load()}>Load pasted data</button>{/if}
			{#if !shared}<button class="btn small" onclick={() => replace('reset')}>{armed === 'reset' ? 'Tap again to replace everything with the demo family' : 'Load the demo family'}</button>{/if}
			{#if canReplace}<button class="btn small danger" onclick={() => replace('clear')}>{armed === 'clear' ? (shared ? 'Tap again to empty the shared tree for everyone' : 'Tap again to clear everything') : 'Start empty'}</button>{/if}
			{#if err}<span class="hint" style="color:var(--warn)">{err}</span>{/if}
		</div>
	</div>
</div>
