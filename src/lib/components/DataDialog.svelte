<script lang="ts">
	import { app, sampleData } from '#lib/app.svelte.ts';
	import { emptyDataset } from '#lib/model/mutations.ts';
	import { makeBackup, pruneMedia, readBackup } from '#lib/storage/index.ts';

	let { onClose }: { onClose: () => void } = $props();

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
		app.data = d;
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
		useData(kind === 'reset' ? sampleData() : emptyDataset());
	}

	// Backups (one file with everything, photos included).
	let saving = $state(false);
	async function download() {
		if (!app.store) return;
		saving = true;
		try {
			const blob = new Blob([await makeBackup(app.store, $state.snapshot(app.data))], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		} finally {
			saving = false;
		}
	}
	let fileInput: HTMLInputElement | undefined = $state();
	async function openFile(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (f) await load(await f.text());
	}
</script>

<div class="overlay">
	<div class="dialog" role="dialog" aria-label="Your data">
		<div class="row"><div class="lbl" style="font-size:14px">Your data (JSON, schema v0.2)</div><button class="btn small" style="margin-left:auto" onclick={onClose}>Close</button></div>
		<p class="hint" style="margin:0">
			Your tree is saved in this browser only, on this device. Clearing the browser's data deletes it, so
			<b>download a backup</b> now and then (it includes photos). You can also copy the data below, or paste data here
			(including from the prototype) and load it.
		</p>
		<div class="row">
			<button class="btn small primary" onclick={download} disabled={saving}>{saving ? 'Preparing…' : 'Download backup'}</button>
			<button class="btn small" onclick={() => fileInput?.click()}>Open backup file…</button>
			<input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={openFile} />
		</div>
		<textarea spellcheck="false" bind:value={text}></textarea>
		<div class="row">
			<button class="btn small" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
			<button class="btn small" onclick={() => load()}>Load pasted data</button>
			<button class="btn small" onclick={() => replace('reset')}>{armed === 'reset' ? 'Tap again to replace everything with the sample' : 'Restore sample'}</button>
			<button class="btn small danger" onclick={() => replace('clear')}>{armed === 'clear' ? 'Tap again to clear everything' : 'Start empty'}</button>
			{#if err}<span class="hint" style="color:var(--warn)">{err}</span>{/if}
		</div>
	</div>
</div>
