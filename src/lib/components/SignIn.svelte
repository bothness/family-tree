<script lang="ts">
	// Family edition: the sign-in screen, over everything, while nobody is signed in (or someone not invited is).
	// "Sign in with Google" uses Google's own button and script, loaded only here; the server checks what Google
	// sends (server/google.ts) and starts a session.
	import { app } from '#lib/app.svelte.ts';
	import { account } from '#lib/sync/http.ts';

	let box: HTMLDivElement | undefined = $state();
	let err = $state('');
	let notInvited = $state<string | null>(app.syncStatus === 'forbidden' ? (app.notInvited ?? null) : null);

	type Google = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void; disableAutoSelect(): void } } };
	const loadScript = () =>
		new Promise<Google>((ok, fail) => {
			const w = window as unknown as { google?: Google };
			if (w.google?.accounts) return ok(w.google);
			const s = document.createElement('script');
			s.src = 'https://accounts.google.com/gsi/client';
			s.async = true;
			s.onload = () => (w.google ? ok(w.google) : fail(new Error("Google's sign-in didn't load")));
			s.onerror = () => fail(new Error("Couldn't load Google's sign-in (are you offline?)"));
			document.head.append(s);
		});

	$effect(() => {
		if (!box) return;
		(async () => {
			try {
				const { googleClientId } = await account.config();
				if (!googleClientId) throw new Error('Google sign-in isn’t set up for this tree yet (GOOGLE_CLIENT_ID).');
				const google = await loadScript();
				google.accounts.id.initialize({
					client_id: googleClientId,
					callback: async ({ credential }: { credential: string }) => {
						err = '';
						try {
							const r = await account.signIn(credential);
							if ('notInvited' in r) notInvited = r.notInvited;
							else location.reload();
						} catch (e) {
							err = (e as Error).message;
						}
					}
				});
				google.accounts.id.renderButton(box!, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
			} catch (e) {
				err = (e as Error).message;
			}
		})();
	});

	async function signOut() {
		await account.signOut();
		await app.store?.wipe();
		location.reload();
	}
</script>

<div class="signin" role="dialog" aria-label="Sign in">
	<div class="signin-card">
		<div class="brand">Family Tree Builder</div>
		{#if notInvited}
			<p>You're signed in with Google as <b>{notInvited}</b>, but that address hasn't been invited to this tree.</p>
			<p class="hint">Ask the tree's owner to invite this address, or sign in with another Google account.</p>
		{:else}
			<p>This is a private family tree. Sign in with the Google account you were invited with.</p>
		{/if}
		<div bind:this={box} class="gsi"></div>
		{#if notInvited}<button class="linkish" onclick={signOut}>Use a different account</button>{/if}
		{#if err}<p class="hint warn">{err}</p>{/if}
		<p class="hint small">Signing in shares only your name and email address with this site.</p>
	</div>
</div>
