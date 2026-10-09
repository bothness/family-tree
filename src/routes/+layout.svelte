<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';

	// Icons, title and sharing previews are in app.html, so they're in the page itself (link previews and search
	// engines don't run the app).
	let { children }: LayoutProps = $props();
</script>

{@render children()}
