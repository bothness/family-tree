<script lang="ts">
	// A person's photo in their panel (V10): add, change, remove, or view it larger. Only a resized copy is kept.
	import { app } from '#lib/app.svelte.ts';
	import { photoOf } from '#lib/model/media.ts';
	import { person } from '#lib/model/queries.ts';
	import Silhouette from './Silhouette.svelte';

	let { pid }: { pid: string } = $props();

	const photo = $derived(photoOf(app.data, pid));
	const sex = $derived(person(app.data, pid)?.sex?.value ?? 'U');
	let input: HTMLInputElement | undefined = $state();
	let busy = $state(false);
	let err = $state('');
	let big = $state<string | null>(null);

	// The panel shows the kept copy (the thumbnail is sized for tree cards), once it has loaded.
	let full = $state<string | null>(null);
	$effect(() => {
		const id = photo?.id;
		let url: string | null = null,
			gone = false;
		if (id)
			app.store?.getMedia(id).then((b) => {
				if (b && !gone) full = url = URL.createObjectURL(b);
			});
		return () => {
			gone = true;
			full = null;
			if (url) URL.revokeObjectURL(url);
		};
	});

	async function picked(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		if (!f) return;
		busy = true;
		err = '';
		try {
			await app.addPhoto(pid, f);
		} catch (x) {
			err = (x as Error).message || "Couldn't add that photo.";
		} finally {
			busy = false;
		}
	}
	async function view() {
		if (!photo) return input?.click();
		const b = await app.store?.getMedia(photo.id);
		big = b ? URL.createObjectURL(b) : (photo.thumb ?? null);
	}
	function close() {
		if (big?.startsWith('blob:')) URL.revokeObjectURL(big);
		big = null;
	}
</script>

<div class="photo-pick" class:has={!!photo}>
	<button class="avatar" type="button" onclick={view} title={photo ? 'View photo' : 'Add a photo'} aria-label={photo ? 'View photo' : 'Add a photo'}>
		{#if photo?.thumb || full}<img src={full ?? photo?.thumb} alt="" />{:else}<Silhouette {sex} />{/if}
		{#if busy}<span class="busy">…</span>{/if}
	</button>
	<div class="photo-acts">
		<button class="linkish" type="button" onclick={() => input?.click()}>{photo ? 'Change' : 'Add photo'}</button>
		{#if photo}<button class="linkish" type="button" onclick={() => app.removePhoto(pid)}>Remove</button>{/if}
	</div>
	<input bind:this={input} type="file" accept="image/*" hidden onchange={picked} />
	{#if err}<p class="hint warn">{err}</p>{/if}
</div>

{#if big}
	<div class="overlay lightbox" role="presentation" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}>
		<img src={big} alt="Photo of {person(app.data, pid)?.names?.[0]?.given ?? 'this person'}" />
	</div>
{/if}
