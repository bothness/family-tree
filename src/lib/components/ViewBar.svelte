<script lang="ts">
	// The bar under the header: saved views (V5/V6) as chips, the focus controls (V3/V4), and hand-picking.
	import { DropdownMenu, Popover } from 'bits-ui';
	import { app } from '#lib/app.svelte.ts';
	import { displayName, person } from '#lib/model/queries.ts';
	import type { FocusWidth } from '#lib/model/focus.ts';
	import { addView, allTags, defaultViewName, deleteView, describeView, renameView, viewKind } from '#lib/model/views.ts';

	const WIDTHS: [FocusWidth, string, string][] = [
		['direct', 'Direct line', 'Ancestors and descendants only'],
		['siblings', '+ Siblings', 'Also brothers, sisters, aunts and uncles'],
		['all', 'All relatives', 'Also cousins, nieces and nephews']
	];
	const depth = (n: number) => (isFinite(n) ? `${n}` : 'all');

	// "−" from "all" steps down from how far the view actually reaches.
	function fewer(k: 'up' | 'down') {
		const f = app.activeFocus!;
		const now = isFinite(f[k]) ? f[k] : (app.focusView?.reach[k] ?? 0);
		app.adjustFocus({ [k]: Math.max(0, now - 1) });
	}

	// Save the current focus as a view: a small popover asking for the name.
	let saveOpen = $state(false);
	let saveName = $state('');
	function openSave(open: boolean) {
		saveOpen = open;
		if (open && app.activeFocus) saveName = defaultViewName(app.data, app.activeFocus);
	}
	function save(e: SubmitEvent) {
		e.preventDefault();
		app.saveFocusAsView(saveName);
		saveOpen = false;
	}

	// Renaming happens in place on the chip.
	let renaming = $state<string | null>(null);
	let renameText = $state('');
	function startRename(id: string) {
		renaming = id;
		renameText = app.data.views.find((v) => v.id === id)?.name ?? '';
	}
	function finishRename(e?: SubmitEvent) {
		e?.preventDefault();
		if (renaming) renameView(app.data, renaming, renameText);
		renaming = null;
	}
	const focusInput = (el: HTMLInputElement) => {
		el.focus();
		el.select();
	};

	// Deleting a view asks twice (it's only a filter, but it may have been set up with care).
	let armed = $state<string | null>(null);

	// A tag that already has its own view opens that view rather than making a second one.
	function newTagView(tag: string) {
		const existing = app.data.views.find((v) => v.scope?.tags?.length === 1 && v.scope.tags[0] === tag);
		app.openView(existing?.id ?? addView(app.data, `Tagged ${tag}`, { tags: [tag] }).id);
	}

	let pickName = $state('Picked people');
	function savePicked(e: SubmitEvent) {
		e.preventDefault();
		app.finishPicking(pickName);
		pickName = 'Picked people';
	}
</script>

{#if app.picked}
	<form class="bar pickbar" onsubmit={savePicked}>
		<span><b>{app.pickingFor ? 'Edit view:' : 'New view:'}</b> click people on the tree to add or remove them. {app.picked.length} picked.</span>
		{#if !app.pickingFor}
			<input class="pickname" type="text" bind:value={pickName} aria-label="View name" />
		{/if}
		<button class="btn small primary" type="submit" disabled={!app.picked.length}>Save view</button>
		<button class="btn small" type="button" onclick={() => app.cancelPicking()}>Cancel</button>
	</form>
{:else}
	<div class="bar">
		<div class="views" role="group" aria-label="Views">
			<button class="chip" aria-pressed={!app.activeView && !app.activeFocus && !app.blank} onclick={() => app.showEveryone()}>Everyone</button>
			{#each app.data.views as v (v.id)}
				{#if renaming === v.id}
					<form class="chip-rename" onsubmit={finishRename}>
						<input type="text" bind:value={renameText} aria-label="View name" use:focusInput onblur={() => finishRename()} onkeydown={(e) => e.key === 'Escape' && (renaming = null)} />
					</form>
				{:else}
					<span class="chip-group" class:on={app.viewId === v.id}>
						<button class="chip" aria-pressed={app.viewId === v.id} title={describeView(app.data, v)} onclick={() => app.openView(v.id)}>
							{v.name}{#if app.viewId === v.id && app.viewChanged}<span class="changed" title="Changed since saved">•</span>{/if}
						</button>
						<DropdownMenu.Root onOpenChange={(o) => !o && (armed = null)}>
							<DropdownMenu.Trigger class="chip-more" aria-label="View options for {v.name}">⋯</DropdownMenu.Trigger>
							<DropdownMenu.Portal>
								<DropdownMenu.Content class="menu" sideOffset={4} align="start">
									<DropdownMenu.Item class="menu-item" onSelect={() => startRename(v.id)}>Rename</DropdownMenu.Item>
									{#if viewKind(v) === 'people'}
										<DropdownMenu.Item class="menu-item" onSelect={() => app.startPicking(v.id)}>Change who's in it</DropdownMenu.Item>
									{/if}
									<DropdownMenu.Separator class="menu-sep" />
									<DropdownMenu.Item
										class="menu-item danger"
										onSelect={(e) => {
											if (armed !== v.id) {
												e.preventDefault(); // keep the menu open for the second click
												armed = v.id;
											} else {
												if (app.viewId === v.id) app.showEveryone();
												deleteView(app.data, v.id);
											}
										}}
									>
										{armed === v.id ? 'Click again to delete' : 'Delete view'}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Portal>
						</DropdownMenu.Root>
					</span>
				{/if}
			{/each}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="chip add">+ New view</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content class="menu" sideOffset={4} align="start">
						{#if app.activeFocus}
							<DropdownMenu.Item class="menu-item" onSelect={() => openSave(true)}>Save the current focus{app.activeView ? ' as a new view' : ''}…</DropdownMenu.Item>
						{:else}
							<div class="menu-note">For a family view, focus on someone (or choose Descendants / Ancestors in their panel), then Save view.</div>
						{/if}
						<DropdownMenu.Separator class="menu-sep" />
						{#each allTags(app.data) as t (t)}
							<DropdownMenu.Item class="menu-item" onSelect={() => newTagView(t)}>Everyone tagged <b>{t}</b></DropdownMenu.Item>
						{/each}
						<DropdownMenu.Item class="menu-item" onSelect={() => app.startPicking()}>Pick people by hand…</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<button class="linkish reset" onclick={() => app.reset()} disabled={app.blank} title="Clear the view and selection, and start again from a search">Reset</button>
		</div>
		<div class="legend">
			<span><span class="ink">Ink</span> = confirmed</span><span><span class="pen">pencil</span> = guess</span>
			<span>dashed line = likely or guessed link</span><span style="color:var(--warn)">orange = children known to be missing</span>
		</div>
	</div>

	{#if app.activeFocus}
		{@const f = app.activeFocus}
		<div class="bar focusbar" role="group" aria-label="Focus">
			<span>Focused on <button class="linkish" onclick={() => app.centreOn(f.id)}>{displayName(person(app.data, f.id))}</button></span>
			<span class="stepper" title="Generations of ancestors shown">
				<button aria-label="Fewer generations up" disabled={f.up === 0} onclick={() => fewer('up')}>−</button><span aria-label="Generations up">↑{depth(f.up)}</span><button aria-label="More generations up" disabled={!isFinite(f.up)} onclick={() => app.adjustFocus({ up: f.up + 1 })}>+</button>
			</span>
			<span class="stepper" title="Generations of descendants shown">
				<button aria-label="Fewer generations down" disabled={f.down === 0} onclick={() => fewer('down')}>−</button><span aria-label="Generations down">↓{depth(f.down)}</span><button aria-label="More generations down" disabled={!isFinite(f.down)} onclick={() => app.adjustFocus({ down: f.down + 1 })}>+</button>
			</span>
			<span class="seg" role="group" aria-label="Who to show">
				{#each WIDTHS as [w, label, hint] (w)}
					<button aria-pressed={f.width === w} title={hint} onclick={() => app.adjustFocus({ width: w })}>{label}</button>
				{/each}
			</span>
			{#if app.activeView && app.viewChanged}
				<button class="btn small primary" onclick={() => app.updateView()}>Update “{app.activeView.name}”</button>
			{/if}
			<!-- Always present while focused, so "+ New view → Save the current focus" can open it too. -->
			<Popover.Root open={saveOpen} onOpenChange={openSave}>
					<Popover.Trigger class="btn small">{app.activeView ? 'Save as new view' : 'Save view'}</Popover.Trigger>
					<Popover.Portal>
						<Popover.Content class="pop" sideOffset={6} align="start">
							<form onsubmit={save}>
								<label class="fld"><span>Name this view</span><input type="text" bind:value={saveName} use:focusInput /></label>
								<div class="row"><button class="btn small primary" type="submit">Save</button><Popover.Close class="btn small">Cancel</Popover.Close></div>
							</form>
						</Popover.Content>
					</Popover.Portal>
			</Popover.Root>
			{#if f.up !== 0 || f.down !== 0}
				<button class="chip" onclick={() => app.collapseTo(f.id)} title="Show only {displayName(person(app.data, f.id))}">Collapse</button>
			{/if}
			<button class="chip" onclick={() => app.showEveryone()} title="Leave focus and show everyone">✕ Show everyone</button>
		</div>
	{/if}
{/if}
