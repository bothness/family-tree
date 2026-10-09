<script lang="ts">
	import { app } from '#lib/app.svelte.ts';
	import StatusPicker from './StatusPicker.svelte';
	import AddRelative from './AddRelative.svelte';
	import PlaceInput from './PlaceInput.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import PersonView from './PersonView.svelte';
	import { edtfRange, fmtDate, parseUserDate } from '#lib/model/edtf.ts';
	import {
		birthStart, childIds, displayName, famAsChild, famLabel, famsAsPartner, fullName, halfSiblings,
		lifeEvent, nameIsGuess, NOW, partnerIds, person, PRESUMED_DEAD_AFTER, primaryName, soloFam
	} from '#lib/model/queries.ts';
	import { deletePerson, setChildOf, setLife } from '#lib/model/mutations.ts';
	import { expandToInclude, type FocusOptions } from '#lib/model/focus.ts';
	import { setViewScope, viewKind } from '#lib/model/views.ts';
	import { DropdownMenu } from 'bits-ui';
	import type { EndReason, Family, Name, NameType, RelType, ResearchStage, Sex, Status } from '#lib/model/types.ts';

	let { pid }: { pid: string } = $props();

	const d = $derived(app.data);
	const p = $derived(person(d, pid)!);
	const main = $derived(primaryName(p));
	const otherNames = $derived((p.names ?? []).map((n, i) => ({ n, i })).filter(({ n }) => n !== main));
	const birth = $derived(lifeEvent(d, pid, 'birth'));
	const death = $derived(lifeEvent(d, pid, 'death'));
	const deceased = $derived(!!(p.deceased || death));
	const birthRange = $derived(edtfRange(birth?.date?.edtf));
	const parentFam = $derived(famAsChild(d, pid));
	const parents = $derived(parentFam ? partnerIds(parentFam) : []);
	const siblings = $derived(parentFam ? childIds(parentFam).filter((x) => x !== pid).sort((a, b) => birthStart(d, a) - birthStart(d, b)) : []);
	const half = $derived(halfSiblings(d, pid));
	const partnerFams = $derived(famsAsPartner(d, pid));

	const childOfOptions = $derived.by(() => {
		const out: [string, string][] = [];
		if (parentFam) out.push([`fam:${parentFam.id}`, famLabel(d, parentFam)]);
		for (const par of parents) {
			for (const g of famsAsPartner(d, par)) if (g !== parentFam && !out.some((o) => o[0] === `fam:${g.id}`)) out.push([`fam:${g.id}`, famLabel(d, g)]);
			if (parents.length === 2 && !soloFam(d, par)) out.push([`solo:${par}`, `${displayName(person(d, par))} + unknown other parent`]);
		}
		out.push(['none', 'Not recorded']);
		return out;
	});

	let info = $state('');
	/** Scroll a newly shown notice into view (the panel may be scrolled down to the add form). */
	// Waits two frames so the add form has closed and the panel has its final height.
	const reveal = (el: HTMLElement) =>
		void requestAnimationFrame(() => requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })));
	/** The relative just added from this panel, so we can say if the current focus hides them. */
	let added = $state<string | null>(null);
	/** The smallest widening of the current focus that would show the person just added. */
	const expansion = $derived(added && app.activeFocus && !app.inView(added) ? expandToInclude(d, app.activeFocus.id, app.activeFocus, added) : null);
	const WIDTH_TEXT = { direct: 'the direct line only', siblings: 'siblings', all: 'all relatives' } as const;
	function describeExpansion(a: FocusOptions, b: FocusOptions) {
		const gens = (n: number, dir: string) => `show ${n} more generation${n > 1 ? 's' : ''} ${dir}`;
		const parts: string[] = [];
		if (b.up > a.up) parts.push(gens(b.up - a.up, 'up'));
		if (b.down > a.down) parts.push(gens(b.down - a.down, 'down'));
		if (b.width !== a.width) parts.push(`include ${WIDTH_TEXT[b.width]}`);
		return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
	}
	let confirmDel = $state(false);
	/** Parents whose certainty was changed here: their switch stays visible after being set to Confirmed. */
	let touchedParents = $state(new Set<string>());
	let moreOpen = $state(false);
	let todoText = $state('');
	let urlText = $state('');
	let urlLabel = $state('');
	// The "just added" notice is about the view at the time: drop it once the focus changes (e.g. Expand view).
	$effect(() => {
		void app.activeFocus;
		added = null;
	});
	$effect(() => {
		void pid; // reset transient UI when switching person
		info = '';
		added = null;
		confirmDel = false;
		touchedParents = new Set();
	});

	const NAME_TYPES: [NameType, string][] = [['married', 'Married name'], ['birth', 'Birth name'], ['deed-poll', 'Deed poll'], ['alias', 'Alias'], ['anglicised', 'Anglicised'], ['religious', 'Religious name'], ['other', 'Other']];
	const REL_TYPES: [RelType, string][] = [['marriage', 'Marriage'], ['civil-partnership', 'Civil partnership'], ['partnership', 'Partnership'], ['unknown', 'Not known']];
	const END_REASONS: [EndReason | '', string][] = [['', '—'], ['death', 'Death'], ['divorce', 'Divorce'], ['separation', 'Separation'], ['annulment', 'Annulment'], ['unknown', 'Not known']];
	const STAGES: [ResearchStage, string][] = [['sketch', 'Sketch'], ['in-progress', 'In progress'], ['researched', 'Researched']];

	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	const ensureMain = (): Name => {
		if (!main) (p.names ??= []).push({ type: 'birth' });
		return primaryName(p)!;
	};
	function setMainName(field: 'given' | 'surname', v: string) {
		const n = ensureMain();
		n[field] = v.trim() || undefined;
		if (n.display && (n.given || n.surname)) delete n.display;
	}
	function setText(field: 'knownAs' | 'notes' | 'sourceNotes', v: string) {
		if (v.trim()) p[field] = v.trim();
		else delete p[field];
	}
	function setDeceased(on: boolean) {
		if (on) p.deceased = true;
		else {
			delete p.deceased;
			if (death) d.events = d.events.filter((x) => x !== death);
		}
	}
	function setRel(f: Family, field: 'start' | 'end', v: string) {
		const r = (f.relationship ??= {});
		const e = parseUserDate(v);
		if (e) r[field] = { ...(r[field] ?? {}), edtf: e };
		else delete r[field];
	}
	/** Set (or clear) how sure a link is: a child's place in a family, or a parent's. */
	function setStatus(link: { status?: Status } | undefined, v: Status | undefined) {
		if (!link) return;
		if (v) link.status = v;
		else delete link.status;
	}
	function setExpected(f: Family, v: string) {
		const n = parseInt(v, 10);
		if (isNaN(n)) delete f.expectedChildren;
		else f.expectedChildren = { ...(f.expectedChildren ?? {}), min: n };
	}
	function addUrl() {
		let u = urlText.trim();
		if (!u) return;
		if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
		((p.links ??= {}).urls ??= []).push(urlLabel.trim() ? { url: u, label: urlLabel.trim() } : { url: u });
		urlText = urlLabel = '';
	}
	function addTodo() {
		if (!todoText.trim()) return;
		((p.research ??= {}).todo ??= []).push(todoText.trim());
		todoText = '';
	}
	function remove() {
		if (!confirmDel) {
			confirmDel = true;
			return;
		}
		const photo = p.photo;
		deletePerson(d, pid);
		// Their photo file goes too, unless someone else still uses it.
		if (photo && !d.media.some((m) => m.id === photo)) app.store?.deleteMedia(photo);
		app.select(null);
	}
	const otherPartner = (f: Family) => partnerIds(f).find((x) => x !== pid);
	const kidsOf = (f: Family) => childIds(f).sort((a, b) => birthStart(d, a) - birthStart(d, b));
</script>

{#snippet personLink(id: string)}
	{@const q = person(d, id)!}
	<button class="plink" class:pencil={nameIsGuess(q)} onclick={() => app.select(id)}>{displayName(q)}</button>
{/snippet}

{#snippet lifeRow(kind: 'birth' | 'death', label: string)}
	{@const e = kind === 'birth' ? birth : death}
	<div class="row life-row">
		<label class="fld"><span>{label}</span>
			<input type="text" class:pencil={e?.date?.status === 'guess'} value={fmtDate(e?.date?.edtf)} placeholder="e.g. 12 Feb 1858, c.1858, 1880s"
				onchange={(ev) => { setLife(d, pid, kind, val(ev), null); if (kind === 'death') p.deceased = true; }} />
		</label>
		<div class="fld"><span>Place</span><PlaceInput {pid} {kind} /></div>
	</div>
	{#if e?.date}
		<div class="row"><span class="hint">This date is</span><StatusPicker value={e.date.status} onchange={(v) => (e.date!.status = v)} /></div>
	{/if}
{/snippet}

<div class="sheet-head">
	<div>
		<h2 class:pencil={nameIsGuess(p)}>{displayName(p)}</h2>
		{#if p.knownAs}<div class="sub">{fullName(p)}</div>{/if}
	</div>
	<div class="head-actions">
		<span class="split">
			<button class="btn small" aria-pressed={app.activeFocus?.id === pid} onclick={() => app.focusOn(pid)} title="Show only this person's family (F)">Focus</button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="btn small" aria-label="More ways to focus">▾</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content class="menu" sideOffset={4} align="end">
						<DropdownMenu.Item class="menu-item" onSelect={() => app.focusOn(pid, { up: 0, down: Infinity, width: 'direct' })}>Descendants of {displayName(p)}</DropdownMenu.Item>
						<DropdownMenu.Item class="menu-item" onSelect={() => app.focusOn(pid, { up: Infinity, down: 0, width: 'direct' })}>Ancestors of {displayName(p)}</DropdownMenu.Item>
						<DropdownMenu.Item class="menu-item" onSelect={() => app.collapseTo(pid)}>Only {displayName(p)}</DropdownMenu.Item>
						{#if app.activeFocus}
							<DropdownMenu.Separator class="menu-sep" />
							<DropdownMenu.Item class="menu-item" onSelect={() => app.showEveryone()}>Remove focus (show everyone)</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</span>
		<button class="x" onclick={() => app.select(null)} aria-label="Close">×</button>
	</div>
</div>
{#if !app.canEdit}
	<PersonView {pid} />
{:else}
<PhotoPicker {pid} />
{#snippet outOfView(id: string, msg: string, primary: { label: string; run: () => void } | null = null)}
	<div class="outofview" role="status" use:reveal>
		<p><b>Not in this view.</b> {msg}</p>
		{#if primary}
			<button class="btn small" onclick={primary.run}>{primary.label}</button>
		{:else}
			<button class="btn small" onclick={() => app.centreOn(id)}>Show in full tree</button>
		{/if}
		<button class="btn small" onclick={() => app.focusOn(id)}>Focus on them</button>
	</div>
{/snippet}
{#if !app.inView(pid)}
	{@render outOfView(pid, app.activeFocus ? `The focus on ${displayName(person(d, app.activeFocus.id))} doesn't include ${displayName(p)}.` : `${displayName(p)} isn't in the view “${app.activeView?.name ?? ''}”.`)}
{/if}

<div class="row">
	<label class="fld"><span>Given names</span><input type="text" class:pencil={main?.status === 'guess'} value={main?.given ?? ''} onchange={(e) => setMainName('given', val(e))} /></label>
	<label class="fld"><span>Surname</span><input type="text" class:pencil={main?.status === 'guess'} value={main?.surname ?? ''} onchange={(e) => setMainName('surname', val(e))} /></label>
</div>
<div class="row"><span class="hint">This name is</span><StatusPicker value={main?.status} onchange={(v) => (ensureMain().status = v)} /></div>
<label class="fld"><span>Known as (shown on the tree)</span>
	<input type="text" value={p.knownAs ?? ''} placeholder="e.g. Annie, or a shorter name" onchange={(e) => setText('knownAs', val(e))} />
</label>

{#each otherNames as { n, i } (i)}
	<div class="oname">
		<div class="row">
			<select style="width:auto" value={n.type ?? 'other'} onchange={(e) => (n.type = val(e) as NameType)}>
				{#each NAME_TYPES as [v, l] (v)}<option value={v}>{l}</option>{/each}
			</select>
			<button class="iconx" onclick={() => p.names!.splice(i, 1)} aria-label="Remove this name">×</button>
		</div>
		<div class="row">
			<label class="fld"><span>Given</span><input type="text" value={n.given ?? ''} onchange={(e) => (n.given = val(e).trim() || undefined)} /></label>
			<label class="fld"><span>Surname</span><input type="text" value={n.surname ?? ''} onchange={(e) => (n.surname = val(e).trim() || undefined)} /></label>
			<label class="fld" style="flex-basis:80px"><span>From</span><input type="text" value={fmtDate(n.date)} onchange={(e) => (n.date = parseUserDate(val(e)) || undefined)} /></label>
		</div>
		<div class="row"><StatusPicker value={n.status} onchange={(v) => (n.status = v)} /></div>
	</div>
{/each}
<div class="row">
	<button class="btn small" onclick={() => { ensureMain(); p.names!.push({ type: p.sex?.value === 'F' ? 'married' : 'other' }); }}>+ Another name</button>
	<span class="hint">e.g. maiden or married name, deed poll</span>
</div>

<div class="row">
	<span class="hint">Sex</span>
	<span class="seg" role="group">
		{#each [['M', 'Male'], ['F', 'Female'], ['U', 'Not known']] as [v, l] (v)}
			<button type="button" aria-pressed={(p.sex?.value ?? 'U') === v} onclick={() => (p.sex = { ...(p.sex ?? {}), value: v as Sex })}>{l}</button>
		{/each}
	</span>
</div>

<div class="blk">
	{@render lifeRow('birth', 'Born')}
	<label class="check"><input type="checkbox" checked={deceased} onchange={(e) => setDeceased((e.currentTarget as HTMLInputElement).checked)} /> Deceased</label>
	{#if deceased}
		{@render lifeRow('death', 'Died')}
	{:else if birthRange && birthRange.start <= NOW - PRESUMED_DEAD_AFTER}
		<span class="hint">Born over {PRESUMED_DEAD_AFTER} years ago, so probably deceased.</span>
	{/if}
</div>

<div class="blk">
	<div class="lbl">Family</div>
	<div class="rels">
		<div class="who">
			<span class="hint">Parents:</span>
			{#if parents.length}{#each parents as id, i (id)}{@render personLink(id)}{i < parents.length - 1 ? ' & ' : ''}{/each}{:else}<span class="hint">not recorded</span>{/if}
		</div>
		{#if parentFam && parents.length}
			{@const link = parentFam.children.find((c) => c.personId === pid)}
			<!-- How sure the link to their parents is (set to "guess" when added with "This is a guess"), and, for a
			     parent who was added as a guess, how sure that parent is. -->
			<div class="row"><span class="hint">This parent link is</span><StatusPicker value={link?.status} onchange={(v) => setStatus(link, v)} /></div>
			{#each parentFam.partners.filter((x) => (x.status && x.status !== 'confirmed') || touchedParents.has(x.personId)) as pr (pr.personId)}
				<div class="row"><span class="hint">{displayName(person(d, pr.personId))} as a parent is</span><StatusPicker value={pr.status} onchange={(v) => ((touchedParents = new Set([...touchedParents, pr.personId])), setStatus(pr, v))} /></div>
			{/each}
		{/if}
		{#if childOfOptions.length > 1}
			<label class="fld"><span>Child of</span>
				<select value={parentFam ? `fam:${parentFam.id}` : 'none'} onchange={(e) => setChildOf(d, pid, val(e))}>
					{#each childOfOptions as [v, l] (v)}<option value={v}>{l}</option>{/each}
				</select>
			</label>
		{/if}
		{#if siblings.length}<div class="who"><span class="hint">Siblings:</span> {#each siblings as id, i (id)}{@render personLink(id)}{i < siblings.length - 1 ? ', ' : ''}{/each}</div>{/if}
		{#if half.length}<div class="who"><span class="hint">Half-siblings:</span> {#each half as id, i (id)}{@render personLink(id)}{i < half.length - 1 ? ', ' : ''}{/each}</div>{/if}
	</div>

	{#each partnerFams as f (f.id)}
		{@const other = otherPartner(f)}
		{@const r = f.relationship ?? {}}
		<div class="fam">
			<div class="fam-head"><span class="hint">Partner:</span> {#if other}{@render personLink(other)}{:else}<span class="hint">not recorded</span>{/if}</div>
			<label class="fld"><span>Relationship</span>
				<select value={r.type ?? 'unknown'} onchange={(e) => ((f.relationship ??= {}).type = val(e) as RelType)}>
					{#each REL_TYPES as [v, l] (v)}<option value={v}>{l}</option>{/each}
				</select>
			</label>
			<div class="row"><span class="hint">This partnership is</span><StatusPicker value={r.status} onchange={(v: Status | undefined) => ((f.relationship ??= {}).status = v)} /></div>
			<div class="row">
				<label class="fld" style="flex-basis:90px"><span>From</span><input type="text" value={fmtDate(r.start?.edtf)} placeholder="e.g. 1883" onchange={(e) => setRel(f, 'start', val(e))} /></label>
				<label class="fld" style="flex-basis:90px"><span>Until</span><input type="text" value={fmtDate(r.end?.edtf)} onchange={(e) => setRel(f, 'end', val(e))} /></label>
				<label class="fld" style="flex-basis:100px"><span>Ended by</span>
					<select value={r.endReason ?? ''} onchange={(e) => { const v = val(e); if (v) (f.relationship ??= {}).endReason = v as EndReason; else delete f.relationship?.endReason; }}>
						{#each END_REASONS as [v, l] (v)}<option value={v}>{l}</option>{/each}
					</select>
				</label>
			</div>
			<div class="who"><span class="hint">Children:</span> {#each kidsOf(f) as id, i (id)}{@render personLink(id)}{i < f.children.length - 1 ? ', ' : ''}{:else}<span class="hint">none yet</span>{/each}</div>
			<div class="row">
				<label class="fld" style="flex:2 1 170px"><span>Are all their children recorded?</span>
					<select value={f.childrenComplete === 'yes' || f.childrenComplete === 'no' ? f.childrenComplete : 'unknown'} onchange={(e) => (f.childrenComplete = val(e) as Family['childrenComplete'])}>
						<option value="unknown">Not sure</option><option value="yes">Yes, all recorded</option><option value="no">No, some missing</option>
					</select>
				</label>
				{#if f.childrenComplete === 'no'}
					<label class="fld" style="flex:1 1 80px"><span>Total expected</span><input type="number" min="0" value={f.expectedChildren?.min ?? ''} onchange={(e) => setExpected(f, val(e))} /></label>
				{/if}
			</div>
		</div>
	{/each}

	<div class="row">
		{#each ['parent', 'partner', 'child', 'sibling'] as const as k (k)}
			<button class="btn small" aria-pressed={app.addKind === k} onclick={() => ((app.addKind = app.addKind === k ? null : k), (info = ''), (added = null))}>+ {k[0].toUpperCase() + k.slice(1)}</button>
		{/each}
	</div>
	{#if app.addKind}
		{#key `${pid}-${app.addKind}`}
			<AddRelative {pid} kind={app.addKind} onDone={(m, id) => ((app.addKind = null), (info = m ?? ''), (added = id))} onCancel={() => (app.addKind = null)} />
		{/key}
	{/if}
	{#if info}<div class="hint">{info}</div>{/if}
	{#if added && person(d, added) && !app.inView(added)}
		{@const name = displayName(person(d, added))}
		{#if app.activeFocus}
			{@render outOfView(
				added,
				`${name} was added, but is outside the current focus.` + (expansion ? ` Expanding the view will ${describeExpansion(app.activeFocus, expansion)}.` : ''),
				expansion ? { label: 'Expand view', run: () => app.adjustFocus(expansion) } : null
			)}
		{:else if app.activeView}
			{@const v = app.activeView}
			{@render outOfView(
				added,
				`${name} was added, but isn't in the view “${v.name}”.`,
				viewKind(v) === 'people' ? { label: 'Add to this view', run: () => setViewScope(d, v.id, { people: [...(v.scope?.people ?? []), added!] }) } : null
			)}
		{/if}
	{/if}
</div>

<!-- Research: its own section (its stage is the dot on the tree cards), between Family and the notes. -->
<div class="blk">
	<div class="lbl">Research</div>
	<span class="seg" role="group" aria-label="Research stage">
		{#each STAGES as [v, l] (v)}
			<button type="button" aria-pressed={p.research?.stage === v} onclick={() => ((p.research ??= {}).stage = v)}>{l}</button>
		{/each}
	</span>
	<ul class="evlist">
		{#each p.research?.todo ?? [] as t, i (i)}
			<li><span class="grow">☐ {t}</span><button class="del" aria-label="Remove" onclick={() => p.research!.todo!.splice(i, 1)}>×</button></li>
		{/each}
	</ul>
	<div class="row">
		<input type="text" bind:value={todoText} placeholder="Add a research task" style="flex:1" onkeydown={(e) => e.key === 'Enter' && addTodo()} />
		<button class="btn small" onclick={addTodo}>Add</button>
	</div>
</div>

<details class="more" bind:open={moreOpen}>
	<summary>Notes, sources and links <span>{[p.notes && 'notes', p.sourceNotes && 'sources', (p.links?.wikidata || p.links?.urls?.length) && 'links'].filter(Boolean).join(' · ')}</span></summary>
	<div class="blk" style="border:0;margin-top:6px">
		<label class="fld"><span>Biography and notes</span><textarea rows="4" value={p.notes ?? ''} onchange={(e) => setText('notes', val(e))}></textarea></label>
		<label class="fld"><span>Sources</span><textarea rows="3" value={p.sourceNotes ?? ''} placeholder="e.g. Birth certificate 1885 (GRO); 1891 census, Leeds; Aunt Jean" onchange={(e) => setText('sourceNotes', val(e))}></textarea></label>
	</div>
	<div class="blk">
		<div class="lbl">Links</div>
		<label class="fld"><span>Wikidata ID (for notable people)</span>
			<input type="text" value={p.links?.wikidata ?? ''} placeholder="e.g. Q42"
				onchange={(e) => { const v = val(e).trim().toUpperCase(); p.links ??= {}; if (/^Q\d+$/.test(v)) p.links.wikidata = v; else delete p.links.wikidata; }} />
		</label>
		{#if p.links?.wikidata}<a class="hint" href="https://www.wikidata.org/wiki/{p.links.wikidata}" target="_blank" rel="noopener">Open {p.links.wikidata} on Wikidata ↗</a>{/if}
		<ul class="evlist">
			{#each p.links?.urls ?? [] as u, i (i)}
				<li><span class="grow"><a href={u.url} target="_blank" rel="noopener">{u.label || u.url}</a></span><button class="del" aria-label="Remove link" onclick={() => p.links!.urls!.splice(i, 1)}>×</button></li>
			{/each}
		</ul>
		<div class="row">
			<input type="text" bind:value={urlText} placeholder="https://…" style="flex:2 1 160px" />
			<input type="text" bind:value={urlLabel} placeholder="Label (optional)" style="flex:1 1 100px" />
			<button class="btn small" onclick={addUrl}>Add link</button>
		</div>
		<label class="fld"><span>Tags (comma separated)</span>
			<input type="text" value={(p.tags ?? []).join(', ')}
				onchange={(e) => { const t = val(e).split(',').map((s) => s.trim()).filter(Boolean); if (t.length) p.tags = t; else delete p.tags; }} />
		</label>
	</div>
	<div class="blk">
		<label class="check"><input type="checkbox" checked={!!p.placeholder} onchange={(e) => { if ((e.currentTarget as HTMLInputElement).checked) p.placeholder = true; else delete p.placeholder; }} /> Placeholder for an unknown person</label>
	</div>
</details>

<div class="del-row">
	<button class="btn danger small" onclick={remove}>{confirmDel ? `Tap again to delete ${displayName(p)}` : 'Delete this person'}</button>
</div>
{/if}
