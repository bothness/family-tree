<script module lang="ts">
	/** Head-and-shoulders shapes in a 36 × 36 box, by recorded sex (M, F, or U for not known). Shared with the
	 *  tree cards, which draw them as SVG symbols. */
	export const SILHOUETTE: Record<'M' | 'F' | 'U', string[]> = {
		M: ['M18 7a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z', 'M5 36c0-7 5.8-11 13-11s13 4 13 11z'],
		F: ['M18 6c-5.2 0-8 3.8-8 8.6 0 3.4.7 6.8-.8 9.4h17.6c-1.5-2.6-.8-6-.8-9.4C26 9.8 23.2 6 18 6z', 'M6 36c0-6.4 5.4-10 12-10s12 3.6 12 10z'],
		U: ['M18 7a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z', 'M6 36c0-6.5 5.4-10.5 12-10.5S30 29.5 30 36z']
	};
	export const silhouetteKey = (sex: string | undefined): 'M' | 'F' | 'U' => (sex === 'M' || sex === 'F' ? sex : 'U');
</script>

<script lang="ts">
	// Stand-in when someone has no photo (V10).
	let { sex = 'U', size = 36 }: { sex?: string; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
	<rect class="sil-bg" width="36" height="36" rx="5" />
	{#each SILHOUETTE[silhouetteKey(sex)] as d (d)}<path class="sil" {d} />{/each}
</svg>
