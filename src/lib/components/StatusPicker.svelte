<script lang="ts">
	import type { Status } from '#lib/model/types.ts';

	/** Confirmed / Likely / Guess toggle. Clicking the active option clears it. */
	let { value, onchange }: { value: Status | undefined; onchange: (v: Status | undefined) => void } = $props();

	const options: [Status, string][] = [
		['confirmed', 'Confirmed'],
		['likely', 'Likely'],
		['guess', 'Guess']
	];
</script>

<span class="seg" role="group">
	{#each options as [v, label] (v)}
		<button type="button" class:g={v === 'guess'} aria-pressed={value === v} onclick={() => onchange(value === v ? undefined : v)}>{label}</button>
	{/each}
</span>
