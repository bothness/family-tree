<script lang="ts">
	// Family edition, owners only: who can use the shared tree. People sign in with Google, so an invite is just
	// their Google email address and a role. Removing someone locks them out at once.
	import { app } from '#lib/app.svelte.ts';
	import { account, type Invite, type Me } from '#lib/sync/http.ts';

	let { onClose }: { onClose: () => void } = $props();
	const ROLES: [Me['role'], string, string][] = [
		['viewer', 'Can view', 'See the tree, but not change it'],
		['editor', 'Can edit', 'Add and change people'],
		['owner', 'Owner', 'Edit, and manage who has access']
	];
	let people = $state<Invite[]>([]);
	let err = $state('');
	let email = $state(''),
		role = $state<Me['role']>('editor'),
		busy = $state(false);
	let armed = $state<string | null>(null);

	async function load() {
		try {
			people = await account.users();
		} catch (e) {
			err = (e as Error).message;
		}
	}
	load();

	async function run(f: () => Promise<void>) {
		busy = true;
		err = '';
		try {
			await f();
			await load();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	function invite(e: SubmitEvent) {
		e.preventDefault();
		const address = email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return void (err = 'That doesn’t look like an email address.');
		run(async () => {
			await account.invite(address, role);
			email = '';
		});
	}
	function remove(p: Invite) {
		if (armed !== p.email) return void (armed = p.email);
		armed = null;
		run(() => account.remove(p.email));
	}
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
	<div class="dialog access" role="dialog" aria-label="People with access">
		<div class="row"><div class="lbl" style="font-size:14px">People with access</div><button class="btn small" style="margin-left:auto" onclick={onClose}>Close</button></div>
		<p class="hint" style="margin:0">
			People sign in with their Google account, so invite them by the email address they use with Google. Send them
			this page's address; they'll see the tree once they sign in. Removing someone signs them out straight away.
		</p>
		<ul class="people">
			{#each people as p (p.email)}
				<li>
					<span class="who"><b>{p.name ?? p.email}</b>{#if p.name}<span class="hint">{p.email}</span>{/if}</span>
					<select value={p.role} disabled={busy} aria-label="Role for {p.email}" onchange={(e) => run(() => account.invite(p.email, e.currentTarget.value as Me['role']))}>
						{#each ROLES as [r, label] (r)}<option value={r}>{label}</option>{/each}
					</select>
					{#if p.email !== app.user?.email}
						<button class="btn small danger" disabled={busy} onclick={() => remove(p)}>{armed === p.email ? 'Click again to remove' : 'Remove'}</button>
					{:else}
						<span class="hint">you</span>
					{/if}
				</li>
			{/each}
		</ul>
		<form class="row" onsubmit={invite}>
			<input type="email" bind:value={email} placeholder="their.email@gmail.com" aria-label="Email address to invite" style="flex:1 1 220px" />
			<select bind:value={role} aria-label="Role">
				{#each ROLES as [r, label, hint] (r)}<option value={r} title={hint}>{label}</option>{/each}
			</select>
			<button class="btn small primary" type="submit" disabled={busy}>Invite</button>
		</form>
		{#if err}<p class="hint warn" style="margin:0">{err}</p>{/if}
	</div>
</div>
