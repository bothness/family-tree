<script lang="ts">
	// Family edition: a small note of how syncing is going, next to the Data button. Clashes are settled
	// automatically (sync/merge.ts), so there's nothing to ask; only the state is shown.
	import { app } from '#lib/app.svelte.ts';

	const LABEL = {
		starting: ['Connecting…', 'Getting the shared tree'],
		saving: ['Saving…', 'Sending your changes'],
		saved: ['Saved', 'Your changes are in the shared tree'],
		offline: ['Offline', "Can't reach the shared tree. Your changes are kept on this device and will be sent when you're back online."],
		'signed-out': ['Not signed in', 'Sign in to see and edit the shared tree'],
		forbidden: ['No access', "You're signed in, but not invited to this tree. Ask the tree's owner for an invite."]
	} as const;
	const s = $derived(app.syncStatus ?? 'starting');
</script>

<span class="sync-status {s}" title={LABEL[s][1]} role="status"><span class="dot" aria-hidden="true"></span>{LABEL[s][0]}</span>
