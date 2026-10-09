<script lang="ts">
	// Family edition: how syncing is going, next to the Data button; click for who's signed in, signing out, and
	// (owners) who has access. Clashes are settled automatically (sync/merge.ts), so there's nothing to ask.
	import { Popover } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import AccessDialog from './AccessDialog.svelte';

	const LABEL: Record<string, [string, string]> = {
		starting: ['Connecting…', 'Getting the shared tree'],
		saving: ['Saving…', 'Sending your changes'],
		saved: ['Saved', 'Your changes are in the shared tree'],
		'view-only': ['View only', 'You can look at the shared tree; ask its owner if you need to edit it. Changes you make here stay on this device.'],
		offline: ['Offline', "Can't reach the shared tree. Your changes are kept on this device and will be sent when you're back online."],
		'signed-out': ['Not signed in', 'Sign in to see and edit the shared tree'],
		forbidden: ['No access', "You're signed in, but not invited to this tree. Ask the tree's owner for an invite."]
	};
	const s = $derived(app.syncStatus ?? 'starting');
	const ROLE = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' } as const;
	let access = $state(false);
	let open = $state(false);

	async function signOut() {
		const { account } = await import('#lib/sync/http.ts');
		await account.signOut();
		// Take the family's tree off this device too.
		await app.store?.wipe();
		location.reload();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger class="sync-status {s}" title={LABEL[s][1]}><span class="dot" aria-hidden="true"></span>{LABEL[s][0]}</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content class="pop account" sideOffset={6} align="end">
			<p class="hint" style="margin:0">{LABEL[s][1]}</p>
			{#if app.user}
				<p style="margin:0">
					Signed in as <b>{app.user.name ?? app.user.email}</b>{#if app.user.name}<br /><span class="hint">{app.user.email}</span>{/if}
					<br /><span class="hint">{ROLE[app.user.role]}</span>
				</p>
				<div class="row">
					{#if app.user.role === 'owner'}<button class="btn small" onclick={() => ((access = true), (open = false))}>People with access…</button>{/if}
					<button class="btn small" onclick={signOut} title="Signs you out and removes the tree from this device">Sign out</button>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
{#if access}<AccessDialog onClose={() => (access = false)} />{/if}
