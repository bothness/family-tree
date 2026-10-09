# Family Tree Sketchbook

A family tree app for one person and close family: sketch trees quickly from patchy information, mark how sure each fact is, and fill in researched detail later. It may later support several editors.

Read `docs/ROADMAP.md` (phases, item codes G1–G11 / V1–V11, decisions log) and `docs/MODEL.md` (data model) before larger changes. `docs/prototype/family-tree-sketchbook.html` is the original single-file prototype. It is the reference for intended behaviour, not code to edit.

## Commands
- `npm run dev`: dev server
- `npm test`: Vitest unit tests (`src/**/*.test.ts`)
- `npm run check`: svelte-check (TypeScript)
- `npm run build`: static build to `build/` (adapter-static, SPA fallback `200.html`)
- `npm run validate [file.json]`: validate a dataset against the JSON Schema and print a research-gaps report

Run `npm test` and `npm run check` before finishing any change.

## Stack and conventions
- SvelteKit 3, Svelte 5 runes, TypeScript, Vite. Client-only SPA (`ssr = false` in `src/routes/+layout.ts`).
- Imports use Node subpath imports with explicit extensions: `#lib/model/queries.ts`, `#lib/app.svelte.ts`, `./types.ts`.
- `src/lib/model/`: plain TypeScript with no Svelte dependencies. Every function takes the `Dataset` explicitly.
  - `types.ts`: mirrors `schema/family-tree.schema.json`. Keep both in step, and update `src/lib/data/example-data.json` and `docs/MODEL.md` when the model changes.
  - `queries.ts`: read-only lookups. `mutations.ts`: in-place changes (these work directly on the Svelte `$state` proxy). `edtf.ts`: dates. `gaps.ts`: research to-do. `migrate.ts`: upgrades older data. `focus.ts`: who a focus view shows, and its edges.
- `src/lib/layout/`: pure layout functions for the tree and timeline, which return positions and lines. Components only render them. `viewport.ts` holds the pan/zoom camera maths.
- UI widgets with complex keyboard/accessibility behaviour use Bits UI (headless, unstyled), styled only with our tokens in `app.css`. No styled UI kits.
- `src/lib/app.svelte.ts`: the shared app state (one `AppState` instance holding `data`, `tab`, `selected`, etc.).
- `src/lib/storage/`: the `DataStore` interface. It currently uses localStorage; GitHub or Cloudflare can be added behind it later.
- `src/app.css`: global tokens and classes ported from the prototype. The design idea is that confirmed facts are drawn in ink (serif) and guesses in pencil (handwritten font), with light and dark themes using tokens only.
- Test logic in `model/` and `layout/` with Vitest, using small hand-built datasets (see `mutations.test.ts`).
- `$state` proxy pitfall: pushing an object into the dataset stores a proxied copy, so never keep editing the original afterwards. Take the stored element back (`d.families.at(-1)!`), as `newFamily`/`newPerson`/`setLife` do. Plain-object tests can't catch this. Tests that need real proxies are `*.svelte.test.ts` files starting with `// @vitest-environment happy-dom` (see `mutations.svelte.test.ts`).

## Data model essentials
- Schema version is `0.2`. `migrate()` upgrades v0.1, so prototype exports can be loaded through the Data dialog.
- **Uncertainty is per fact.** Names, dates, partnerships and parent–child links each have `status: confirmed | likely | guess | conflicting`. The UI shows Confirmed / Likely / Guess.
- **Research state is per person:** `research.stage` (sketch / in-progress / researched) and `todo[]`.
- **Dates are EDTF strings** (`1858~`, `188X`, `../1901`, `1901/1911`). Users type everyday forms ("c.1858", "1880s", "before 1901"), and `parseUserDate` converts them.
- **Families** have 0–2 partners plus children. Each child belongs to exactly one family, and a parent can be in several, which is how half-siblings work. `childrenComplete` and `expectedChildren` record known gaps.
- Birth and death are stored as events. Other life events are kept in the model but hidden from the UI for now.
- `knownAs` is shown on the tree. `notes` is the biography and `sourceNotes` holds free-text sources.
- `deceased: true`, or absent (living or not known). Anyone born over 110 years ago is treated as probably deceased.
- **Derived data is never stored.** Date ranges, generations, branches and gaps are all computed.

## Product principles
- Sketching must stay quick. Extra detail is optional and tucked away, and should never complicate adding basic people.
- Gaps should always be visible: guesses in pencil, dashed lines for uncertain links, orange placeholders for children known to be missing (an expected count was recorded), pencil "more children?" placeholders where there might be more, and the Research to-do tab.
- Use plain language in the UI ("Child of", "Someone already added"), not data-model terms.

## Where we are
- Phase A (editing and data model) is done.
- **Phase B (navigation) is done** (merged to `main` 9 Oct 2026):
  - done: zoom, pan and fit (V1); search and centre (V3); focus mode with separate up/down depths and a direct / + siblings / all relatives width switch (V3, V4). Focus is kept in the page address (`#focus=…&up=…&down=…&w=…`) and filters every tab.
  - done: saved views (V5/V6), shown as chips under the header (`ViewBar.svelte`, `model/views.ts`). One rule per view: a focus (`scope.root` + `up`/`down`/`width`, absent depth = all generations), a tag, or a hand-picked `people` list. Opening a focus view fills the focus bar; changes show "Update view". The open view is in the page address too (`#view=…`).
  - done: collapse to one person (a 0/0 focus shows only that person, no partners) and Reset to an empty canvas (`app.blank`, `#start`) (V2).
- **Next is Phase C:** our own tree layout, replacing `src/lib/layout/tree.ts`. The current layout is an interim port: it's left-aligned, has one connector level per generation and no line hops. Layout rules:
  - centred
  - father consistently on one side
  - siblings grouped and ordered by age
  - separate connector levels for half-sibling groups
  - hops where lines cross
  - animated transitions between states when the selection, focus or view changes (V11), so keep layouts stable between states
- Then Phase D: place lookup (Nominatim or Wikidata) and photos.
