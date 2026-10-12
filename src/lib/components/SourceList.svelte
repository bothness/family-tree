<script lang="ts">
	// A person's sources. Sources are shared (like places): adding one offers those already in the tree, and editing
	// one changes it for everyone who uses it. What a source tells us about this person is their own note.
	import { Combobox } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import { fmtDate, parseUserDate } from '#lib/model/edtf.ts';
	import { displayName, person } from '#lib/model/queries.ts';
	import { SOURCE_TYPES, cite, knownSources, source, sourceFromText, sourceTypeLabel, sourceUsers, uncite } from '#lib/model/sources.ts';
	import type { SourceType } from '#lib/model/types.ts';

	let { pid }: { pid: string } = $props();

	const d = $derived(app.data);
	const p = $derived(person(d, pid)!);
	let editing = $state<string | null>(null);

	let query = $state('');
	let open = $state(false);
	let value = $state('');
	const known = $derived(open ? knownSources(d, query, { exclude: pid }) : []);
	const guess = $derived(query.trim() ? sourceFromText(query) : null);

	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	let chosen = false;
	let input = $state<HTMLInputElement | null>(null);
	function add(from: string | ReturnType<typeof sourceFromText>) {
		editing = cite(d, pid, from);
		open = false;
		// Empty the box after the list has closed (which puts the chosen item's name in it).
		setTimeout(() => {
			query = value = '';
			if (input) input.value = '';
		}, 0);
	}
	function choose(v: string) {
		if (!v) return;
		chosen = true;
		if (v.startsWith('known:')) add(v.slice(6));
		else if (v === 'new' && guess) add(guess);
	}
	// Closing without choosing keeps what was typed as a new source, as the place field does.
	function onOpenChange(o: boolean) {
		open = o;
		if (o) return void (chosen = false);
		setTimeout(() => {
			if (chosen) return void (chosen = false);
			if (query.trim() && guess) add(guess);
		}, 0);
	}
	function setDetail(sid: string, v: string) {
		const c = p.citations?.find((x) => x.sourceId === sid);
		if (!c) return;
		if (v.trim()) c.detail = v.trim();
		else delete c.detail;
	}
	function setField(sid: string, k: 'title' | 'url' | 'date', v: string) {
		const s = source(d, sid);
		if (!s) return;
		v = v.trim();
		if (k === 'title') s.title = v || s.title;
		else if (k === 'date') {
			const e = parseUserDate(v);
			if (e) s.date = e;
			else delete s.date;
		}
		else if (v) s.url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
		else delete s.url;
	}
	function remove(sid: string) {
		if (editing === sid) editing = null;
		uncite(d, pid, sid);
	}
	const others = (sid: string) => sourceUsers(d, sid).filter((x) => x !== pid);
</script>

<ul class="srclist">
	{#each p.citations ?? [] as c (c.sourceId)}
		{@const s = source(d, c.sourceId)}
		{#if s}
			<li>
				<div class="src-line">
					<button class="linkish src-title" aria-expanded={editing === s.id} onclick={() => (editing = editing === s.id ? null : s.id)}>{s.title}</button>
					{#if s.url}<a href={s.url} target="_blank" rel="noopener" aria-label="Open {s.title}">↗</a>{/if}
					<span class="src-type">{sourceTypeLabel(s.type)}{#if s.date} · {fmtDate(s.date)}{/if}</span>
					<button class="del" aria-label="Remove this source from {displayName(p)}" onclick={() => remove(s.id)}>×</button>
				</div>
				{#if c.detail && editing !== s.id}<div class="src-detail">{c.detail}</div>{/if}
				{#if editing === s.id}
					<div class="oname">
						<label class="fld"><span>What it tells us about {displayName(p)} (optional)</span>
							<input type="text" value={c.detail ?? ''} placeholder="e.g. p. 214, or confirmed her birthday" onchange={(e) => setDetail(s.id, val(e))} />
						</label>
						<div class="row">
							<label class="fld" style="flex:2 1 180px"><span>Source</span><input type="text" value={s.title} onchange={(e) => setField(s.id, 'title', val(e))} /></label>
							<label class="fld" style="flex:1 1 120px"><span>Kind</span>
								<select value={s.type} onchange={(e) => (s.type = val(e) as SourceType)}>
									{#each SOURCE_TYPES as [v, l] (v)}<option value={v}>{l}</option>{/each}
								</select>
							</label>
						</div>
						<div class="row">
							<label class="fld" style="flex:2 1 180px"><span>Web address</span><input type="text" value={s.url ?? ''} placeholder="https://…" onchange={(e) => setField(s.id, 'url', val(e))} /></label>
							<label class="fld" style="flex:1 1 80px"><span>Year</span><input type="text" value={fmtDate(s.date)} onchange={(e) => setField(s.id, 'date', val(e))} /></label>
						</div>
						{#if others(s.id).length}
							<div class="hint">Also used for {#each others(s.id) as id, i (id)}<button class="plink" onclick={() => app.select(id)}>{displayName(person(d, id))}</button>{i < others(s.id).length - 1 ? ', ' : ''}{/each}. Changes to the source apply to them too.</div>
						{/if}
					</div>
				{/if}
			</li>
		{/if}
	{/each}
</ul>
<Combobox.Root type="single" bind:value bind:open {onOpenChange} onValueChange={choose} inputValue={query}>
	<Combobox.Input bind:ref={input} class="place-input" placeholder="Add a source: what it is, or paste a link" autocomplete="off" oninput={(e) => (query = e.currentTarget.value)} aria-label="Add a source" />
	<Combobox.Portal>
		<Combobox.Content class="search-pop" sideOffset={4} align="start">
			{#if known.length}
				<Combobox.Group>
					<Combobox.GroupHeading class="pop-head">In your tree</Combobox.GroupHeading>
					{#each known as k (k.source.id)}
						<Combobox.Item value="known:{k.source.id}" label={k.source.title} class="search-item">
							<span class="nm">{k.source.title}</span><span class="yr">{k.uses ? `used for ${k.uses}` : sourceTypeLabel(k.source.type)}</span>
						</Combobox.Item>
					{/each}
				</Combobox.Group>
			{/if}
			{#if guess}
				<Combobox.Item value="new" label={query} class="search-item">
					<span class="aka">Add</span><span class="nm">“{guess.title}”</span><span class="yr">{sourceTypeLabel(guess.type)}</span>
				</Combobox.Item>
			{:else}
				<div class="search-none">e.g. “Grandma”, “1891 census, Leeds”, or a web address</div>
			{/if}
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
