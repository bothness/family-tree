<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import { cardDates, childIds, displayName, famAsChild, famsAsPartner, partnerIds, person, searchPeople, soloFam } from '#lib/model/queries.ts';
	import { linkPeople, newPerson, setLife, type RelativeKind } from '#lib/model/mutations.ts';
	import type { Sex } from '#lib/model/types.ts';

	let { pid, kind, onDone, onCancel }: { pid: string; kind: RelativeKind; onDone: (info?: string) => void; onCancel: () => void } = $props();

	let mode = $state<'new' | 'existing'>('new');
	let name = $state('');
	let born = $state('');
	let sex = $state<Sex | ''>('');
	let unsure = $state(false);
	let query = $state('');
	let pick = $state<string | null>(null);
	let msg = $state('');

	const d = $derived(app.data);
	const me = $derived(person(d, pid)!);
	const fams = $derived(famsAsPartner(d, pid));
	let famId = $state<string>('');
	$effect(() => {
		if (!famId && fams.length) famId = fams[0].id;
	});
	const soloKids = $derived(kind === 'partner' ? (soloFam(d, pid) ? childIds(soloFam(d, pid)!) : []) : []);
	let kids = $state<string[]>([]);
	$effect(() => {
		kids = [...soloKids];
	});

	const results = $derived(searchPeople(d, query, { exclude: pid, limit: 12 }));

	function go() {
		let oid: string;
		let created: string | null = null;
		if (mode === 'existing') {
			if (!pick) {
				msg = 'Choose someone from the list first.';
				return;
			}
			oid = pick;
		} else {
			const np = newPerson(d, name, { unsure, tags: me.tags, sex: sex || undefined });
			oid = created = np.id;
		}
		const r = linkPeople(d, kind, pid, oid, { unsure: mode === 'new' && unsure, kids, famId });
		if ('error' in r) {
			if (created) d.people = d.people.filter((x) => x.id !== created);
			msg = r.error;
			return;
		}
		if (created && born) setLife(d, created, 'birth', born, null, unsure ? 'guess' : undefined);
		const hidden = app.activeFocus && !app.inView(oid) ? `${displayName(person(d, oid))} is outside the current focus, so isn't shown.` : '';
		onDone([r.info, hidden].filter(Boolean).join(' '));
	}

	const focus = (el: HTMLElement) => el.focus();
	const otherParentLabel = (fid: string) => {
		const f = d.families.find((f) => f.id === fid)!;
		const o = partnerIds(f).find((x) => x !== pid);
		return o ? displayName(person(d, o)) : 'Unknown';
	};
</script>

<div class="addform">
	<div class="row">
		<div class="lbl">Add {kind}</div>
		<span class="seg" role="group" style="margin-left:auto">
			<button type="button" aria-pressed={mode === 'new'} onclick={() => ((mode = 'new'), (msg = ''))}>New person</button>
			<button type="button" aria-pressed={mode === 'existing'} onclick={() => ((mode = 'existing'), (msg = ''))}>Someone already added</button>
		</span>
	</div>

	{#if mode === 'new'}
		<label class="fld"><span>Name (leave blank if unknown)</span>
			<input type="text" bind:value={name} autocomplete="off" use:focus onkeydown={(e) => e.key === 'Enter' && go()} />
		</label>
		<div class="row">
			<label class="fld"><span>Born (optional)</span><input type="text" bind:value={born} placeholder="e.g. c.1890" /></label>
			<label class="fld"><span>Sex</span>
				<select bind:value={sex}><option value="">Not known</option><option value="M">Male</option><option value="F">Female</option></select>
			</label>
		</div>
		<label class="check"><input type="checkbox" bind:checked={unsure} /> This is a guess</label>
	{:else}
		<label class="fld"><span>Search</span><input type="text" bind:value={query} autocomplete="off" placeholder="Type a name" use:focus oninput={() => (pick = null)} /></label>
		<div class="results">
			{#each results as x (x.id)}
				<button type="button" aria-pressed={pick === x.id} onclick={() => (pick = x.id)}>{displayName(person(d, x.id))}{#if x.alsoKnownAs}<span class="yr">({x.alsoKnownAs})</span>{/if}<span class="yr">{cardDates(d, x.id)}</span></button>
			{:else}
				<span class="hint">No matches</span>
			{/each}
		</div>
	{/if}

	{#if kind === 'child' && fams.length > 1}
		<label class="fld"><span>Other parent</span>
			<select bind:value={famId}>
				{#each fams as f (f.id)}<option value={f.id}>{otherParentLabel(f.id)}</option>{/each}
				{#if !soloFam(d, pid)}<option value="solo">Unknown</option>{/if}
			</select>
		</label>
	{/if}

	{#if soloKids.length}
		<div class="fld"><span>Also the other parent of</span>
			{#each soloKids as c (c)}
				<label class="check"><input type="checkbox" value={c} bind:group={kids} /> {displayName(person(d, c))}</label>
			{/each}
		</div>
	{/if}

	{#if kind === 'parent' && famAsChild(d, pid) && partnerIds(famAsChild(d, pid)!).length >= 2}
		<span class="hint">Two parents are already recorded.</span>
	{/if}

	<div class="row">
		<button class="btn primary small" onclick={go}>Add {kind}</button>
		<button class="btn small" onclick={onCancel}>Cancel</button>
	</div>
	{#if msg}<div class="hint" style="color:var(--warn)">{msg}</div>{/if}
</div>
