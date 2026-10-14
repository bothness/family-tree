<script lang="ts">
	// A person, read-only: what viewers of the family edition see in the person panel instead of the editing form
	// (PersonSheet). The same facts, as text, with the same marks for how sure each is (pencil for guesses, a word
	// for "likely" and "sources disagree"); family members are links.
	import { app } from '#lib/app.svelte.ts';
	import PhotoPicker from './PhotoPicker.svelte';
	import { dateUnsure, datesDisagree, edtfRange, fmtDate } from '#lib/model/edtf.ts';
	import { birthStart, childIds, displayName, famAsChild, famsAsPartner, halfSiblings, lifeEvent, nameIsGuess, NOW, partnerIds, person, PRESUMED_DEAD_AFTER, primaryName } from '#lib/model/queries.ts';
	import { source, sourceTypeLabel } from '#lib/model/sources.ts';
	import type { EdtfDate, Family, LifeEvent, NameType, PlaceRef, Status } from '#lib/model/types.ts';

	let { pid }: { pid: string } = $props();

	const d = $derived(app.data);
	const p = $derived(person(d, pid)!);
	const main = $derived(primaryName(p));
	const otherNames = $derived((p.names ?? []).filter((n) => n !== main));
	const birth = $derived(lifeEvent(d, pid, 'birth'));
	const death = $derived(lifeEvent(d, pid, 'death'));
	const birthRange = $derived(edtfRange(birth?.date?.edtf));
	const parentFam = $derived(famAsChild(d, pid));
	const parents = $derived(parentFam ? partnerIds(parentFam) : []);
	const siblings = $derived(parentFam ? childIds(parentFam).filter((x) => x !== pid).sort((a, b) => birthStart(d, a) - birthStart(d, b)) : []);
	const half = $derived(halfSiblings(d, pid));
	const partnerFams = $derived(famsAsPartner(d, pid));

	const NAME_TYPE: Partial<Record<NameType, string>> = { married: 'Married name', birth: 'Birth name', 'deed-poll': 'Deed poll', alias: 'Alias', anglicised: 'Anglicised', religious: 'Religious name', other: 'Also known as' };
	const REL = { marriage: 'Married', 'civil-partnership': 'Civil partnership', partnership: 'Partners', unknown: 'Partners' } as const;
	const ENDED = { death: 'until a death', divorce: 'divorced', separation: 'separated', annulment: 'annulled', unknown: 'ended' } as const;
	const STAGE = { sketch: 'Sketch', 'in-progress': 'In progress', researched: 'Researched' } as const;
	const SEX = { M: 'Male', F: 'Female', U: 'Not known' } as const;
	/** A word for how sure a fact is (none for confirmed or unknown). */
	const sure = (s?: Status) => (s === 'likely' ? 'likely' : s === 'guess' ? 'a guess' : s === 'conflicting' ? 'sources disagree' : '');
	const placeName = (ref?: PlaceRef) => {
		const pl = ref && d.places.find((x) => x.id === ref.placeId);
		return pl ? [pl.name, ref!.detail, pl.context].filter(Boolean).join(', ') : '';
	};
	const placeOf = (e?: LifeEvent) => placeName(e?.place);
	const kidsOf = (f: Family) => childIds(f).sort((a, b) => birthStart(d, a) - birthStart(d, b));
	const otherPartner = (f: Family) => partnerIds(f).find((x) => x !== pid);
</script>

{#snippet personLink(id: string)}
	{@const q = person(d, id)!}
	<button class="plink" class:pencil={nameIsGuess(q)} onclick={() => app.select(id)}>{displayName(q)}</button>
{/snippet}

{#snippet when(date: EdtfDate | undefined)}
	{#if date?.edtf}<span class:pencil={dateUnsure(date.edtf)}>{fmtDate(date.edtf)}</span>{#if datesDisagree(date.edtf)}<span class="sure">&nbsp;(sources disagree)</span>{/if}{/if}
{/snippet}

{#snippet where(ref: PlaceRef | undefined)}
	{#if placeName(ref)}<span class:pencil={ref?.status === 'guess'}>{placeName(ref)}</span>{#if sure(ref?.status)}<span class="sure">&nbsp;({sure(ref?.status)})</span>{/if}{/if}
{/snippet}

{#snippet life(label: string, e: LifeEvent | undefined)}
	<div class="ro-row">
		<span class="ro-label">{label}</span>
		<span>
			{#if e?.date?.edtf || placeOf(e)}
				{@render when(e?.date)}{#if e?.date?.edtf && placeOf(e)},&nbsp;{/if}{@render where(e?.place)}
			{:else}
				<span class="hint">not recorded</span>
			{/if}
		</span>
	</div>
{/snippet}

<p class="ro-note">You can view this tree. Ask its owner if you'd like to edit it.</p>
<PhotoPicker {pid} readonly />

<div class="ro">
	<div class="ro-row">
		<span class="ro-label">Name</span>
		<span><span class:pencil={main?.status === 'guess'}>{[main?.given, main?.surname].filter(Boolean).join(' ') || displayName(p)}</span>{#if sure(main?.status)}<span class="sure">&nbsp;({sure(main?.status)})</span>{/if}</span>
	</div>
	{#if p.knownAs}<div class="ro-row"><span class="ro-label">Known as</span><span>{p.knownAs}</span></div>{/if}
	{#each otherNames as n, i (i)}
		<div class="ro-row">
			<span class="ro-label">{NAME_TYPE[n.type ?? 'other'] ?? 'Also known as'}</span>
			<span><span class:pencil={n.status === 'guess'}>{[n.given, n.surname].filter(Boolean).join(' ')}</span>{#if n.date}<span class="hint"> from {fmtDate(n.date)}</span>{/if}{#if sure(n.status)}<span class="sure">&nbsp;({sure(n.status)})</span>{/if}</span>
		</div>
	{/each}
	{#if p.sex?.value && p.sex.value !== 'U'}<div class="ro-row"><span class="ro-label">Sex</span><span>{SEX[p.sex.value]}</span></div>{/if}
</div>

<div class="blk ro">
	{@render life('Born', birth)}
	{#if death || p.deceased}
		{@render life('Died', death)}
	{:else if birthRange && birthRange.start <= NOW - PRESUMED_DEAD_AFTER}
		<span class="hint">Born over {PRESUMED_DEAD_AFTER} years ago, so probably deceased.</span>
	{/if}
</div>

<div class="blk ro">
	<div class="lbl">Family</div>
	<div class="who">
		<span class="hint">{parentFam?.children.find((c) => c.personId === pid)?.relation === 'adopted' ? 'Adoptive parents:' : 'Parents:'}</span>
		{#if parents.length}{#each parents as id, i (id)}{@render personLink(id)}{#if sure(parentFam?.partners.find((x) => x.personId === id)?.status)}<span class="sure">&nbsp;({sure(parentFam?.partners.find((x) => x.personId === id)?.status)})</span>{/if}{i < parents.length - 1 ? ' & ' : ''}{/each}{#if sure(parentFam?.children.find((c) => c.personId === pid)?.status)}<span class="sure">&nbsp;(the link is {sure(parentFam?.children.find((c) => c.personId === pid)?.status)})</span>{/if}{:else}<span class="hint">not recorded</span>{/if}
	</div>
	{#if siblings.length}<div class="who"><span class="hint">Siblings:</span> {#each siblings as id, i (id)}{@render personLink(id)}{i < siblings.length - 1 ? ', ' : ''}{/each}</div>{/if}
	{#if half.length}<div class="who"><span class="hint">Half-siblings:</span> {#each half as id, i (id)}{@render personLink(id)}{i < half.length - 1 ? ', ' : ''}{/each}</div>{/if}
	{#each partnerFams as f (f.id)}
		{@const other = otherPartner(f)}
		{@const r = f.relationship ?? {}}
		<div class="fam">
			<div class="who">
				<span class="hint">{REL[r.type ?? 'unknown']}:</span>
				{#if other}{@render personLink(other)}{:else}<span class="hint">partner not recorded</span>{/if}
				{#if sure(r.status)}<span class="sure">&nbsp;({sure(r.status)})</span>{/if}
			</div>
			{#if r.start?.edtf || r.end?.edtf || placeName(r.place)}
				<div class="hint">
					{#if r.start?.edtf}from {@render when(r.start)}{/if}{#if placeName(r.place)}{r.start?.edtf ? ', ' : ''}in {@render where(r.place)}{/if}{#if r.end?.edtf}{r.start?.edtf || placeName(r.place) ? '; ' : ''}{ENDED[r.endReason ?? 'unknown']} {@render when(r.end)}{:else if r.endReason && r.endReason !== 'unknown' && r.endReason !== 'death'}{r.start?.edtf || placeName(r.place) ? '; ' : ''}{ENDED[r.endReason]}{/if}
				</div>
			{/if}
			<div class="who"><span class="hint">Children:</span> {#each kidsOf(f) as id, i (id)}{@render personLink(id)}{i < f.children.length - 1 ? ', ' : ''}{:else}<span class="hint">none recorded</span>{/each}</div>
			{#if f.childrenComplete === 'no'}
				<div class="hint">Some children aren't recorded yet{#if f.expectedChildren?.min} ({f.expectedChildren.min} expected in all){/if}.</div>
			{/if}
		</div>
	{/each}
</div>

{#if p.research?.stage || p.research?.todo?.length}
	<div class="blk ro">
		<div class="lbl">Research</div>
		{#if p.research?.stage}<div>{STAGE[p.research.stage]}</div>{/if}
		{#if p.research?.todo?.length}
			<ul class="evlist">{#each p.research.todo as t, i (i)}<li>☐ {t}</li>{/each}</ul>
		{/if}
	</div>
{/if}

{#if p.notes || p.citations?.length || p.tags?.length}
	<div class="blk ro">
		{#if p.notes}<div class="lbl">Biography and notes</div><p class="ro-text">{p.notes}</p>{/if}
		{#if p.citations?.length}
			<div class="lbl">Sources</div>
			<ul class="srclist plain">
				{#each p.citations as c (c.sourceId)}
					{@const s = source(d, c.sourceId)}
					{#if s}
						<li>
							<div class="src-line">
								{#if s.url}<a href={s.url} target="_blank" rel="noopener">{s.title} ↗</a>{:else}<span>{s.title}</span>{/if}
								<span class="src-type">{sourceTypeLabel(s.type)}{#if s.date} · {fmtDate(s.date)}{/if}</span>
							</div>
							{#if c.detail}<div class="src-detail">{c.detail}</div>{/if}
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
		{#if p.tags?.length}<div class="hint">Tags: {p.tags.join(', ')}</div>{/if}
	</div>
{/if}
