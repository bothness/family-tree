<script lang="ts">
	import { app, sampleData } from '#lib/app.svelte.ts';
	import { emptyDataset } from '#lib/model/mutations.ts';
	import { migrate } from '#lib/model/migrate.ts';

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
	function load() {
		try {
			const d = JSON.parse(text);
			if (!Array.isArray(d.people) || !Array.isArray(d.families) || !Array.isArray(d.events)) throw new Error('it needs people, families and events lists.');
			app.data = migrate(d);
			app.select(null);
			app.branch = 'all';
			onClose();
		} catch (e) {
			err = "Couldn't load that: " + (e as Error).message;
		}
	}
	function replace(kind: 'reset' | 'clear') {
		if (armed !== kind) {
			armed = kind;
			return;
		}
		app.data = kind === 'reset' ? sampleData() : emptyDataset();
		app.select(null);
		app.branch = 'all';
		onClose();
	}
</script>

<div class="overlay">
	<div class="dialog" role="dialog" aria-label="Your data">
		<div class="row"><div class="lbl" style="font-size:14px">Your data (JSON, schema v0.2)</div><button class="btn small" style="margin-left:auto" onclick={onClose}>Close</button></div>
		<p class="hint" style="margin:0">Changes are saved in this browser only. Copy this to keep it, or paste data here (including from the prototype) and load it.</p>
		<textarea spellcheck="false" bind:value={text}></textarea>
		<div class="row">
			<button class="btn small primary" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
			<button class="btn small" onclick={load}>Load pasted data</button>
			<button class="btn small" onclick={() => replace('reset')}>{armed === 'reset' ? 'Tap again to replace everything with the sample' : 'Restore sample'}</button>
			<button class="btn small danger" onclick={() => replace('clear')}>{armed === 'clear' ? 'Tap again to clear everything' : 'Start empty'}</button>
			{#if err}<span class="hint" style="color:var(--warn)">{err}</span>{/if}
		</div>
	</div>
</div>
