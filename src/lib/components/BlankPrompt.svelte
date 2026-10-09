<script lang="ts">
	// Shown after Reset (V2): an empty canvas with nobody selected, inviting you to pick a starting point.
	import { app } from '#lib/app.svelte.ts';

	const search = () => document.querySelector<HTMLInputElement>('.search-input')?.focus();
</script>

<div class="empty blank">
	<p class="blank-title">Nobody shown yet.</p>
	<p>
		<button class="btn small primary" onclick={search}>Search for someone</button> to start from them (or press <kbd>/</kbd>),
		open a saved view above, or
		<button class="btn small" onclick={() => app.showEveryone()}>Show everyone</button>
	</p>
</div>
