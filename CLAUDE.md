# Family Tree Builder

A family tree app for one person and close family: sketch trees quickly from patchy information, mark how sure each fact is, and fill in researched detail later. It may later support several editors.

Read `docs/ROADMAP.md` (phases, item codes G1–G11 / V1–V12, D1, decisions log) and `docs/MODEL.md` (data model) before larger changes. `docs/prototype/family-tree-sketchbook.html` is the original single-file prototype. It is the reference for intended behaviour, not code to edit.

## Commands
- `npm run dev`: dev server
- `npm test`: Vitest unit tests (`src/**/*.test.ts`)
- `npm run check`: svelte-check (TypeScript), plus the server code (`tsc -p server`)
- `npm run build`: static build to `build/` (adapter-static, SPA fallback `404.html`, `.nojekyll`); `BASE_PATH=/family-tree npm run build` for a sub-path. `.github/workflows/deploy.yml` publishes `main` to GitHub Pages
- `npm run validate [file.json]`: validate a dataset against the JSON Schema and print a research-gaps report
- `npm run dev:family`: the family edition (shared data) locally: builds with `SYNC=cloudflare` and runs the site plus its API (`functions/`, `server/`) on wrangler's emulator with local D1 and R2, at http://localhost:8788. Copy `.dev.vars.example` to `.dev.vars` first

Run `npm test` and `npm run check` before finishing any change.

## Stack and conventions
- SvelteKit 3, Svelte 5 runes, TypeScript, Vite. Client-only SPA (`ssr = false` in `src/routes/+layout.ts`).
- Imports use Node subpath imports with explicit extensions: `#lib/model/queries.ts`, `#lib/app.svelte.ts`, `./types.ts`.
- `src/lib/model/`: plain TypeScript with no Svelte dependencies. Every function takes the `Dataset` explicitly.
  - `types.ts`: mirrors `schema/family-tree.schema.json`. Keep both in step, and update `src/lib/data/example-data.json` and `docs/MODEL.md` when the model changes.
  - `queries.ts`: read-only lookups. `mutations.ts`: in-place changes (these work directly on the Svelte `$state` proxy). `edtf.ts`: dates. `gaps.ts`: research to-do. `migrate.ts`: upgrades older data. `focus.ts`: who a focus view shows, and its edges.
- `src/lib/layout/`: pure layout functions for the tree and timeline, which return positions and lines. Components only render them. `viewport.ts` holds the pan/zoom camera maths.
  - The tree layout is two steps: `positions.ts` (where cards go) then `connectors.ts` (lines, bus heights, hops, family anchors), which works from card positions alone so `TreeView` can re-route lines on in-between positions while animating. `tree.ts` combines them. `check.ts` checks a layout against the layout rules; `tree.test.ts` runs it on the sample in several modes. Run it after any layout change.
- UI widgets with complex keyboard/accessibility behaviour use Bits UI (headless, unstyled), styled only with our tokens in `app.css`. No styled UI kits.
- `src/lib/app.svelte.ts`: the shared app state (one `AppState` instance holding `data`, `tab`, `selected`, etc.).
- `src/lib/storage/`: the `DataStore` interface (async; data plus photo files). It uses IndexedDB (falling back to localStorage where IndexedDB is off); older localStorage data is brought across on first load; GitHub or Cloudflare can be added behind it later. A browser-only public edition is planned, so the app must keep working fully with no server: back-end sync is a layer on top of the browser store, never a requirement.
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
- Gaps should always be visible: guesses in pencil, dashed lines for uncertain links, grey dashed placeholders for missing children ("+2 more expected" in plain text when a count was recorded, a pencilled "more children?" when there might be more), and the Research to-do tab.
- Use plain language in the UI ("Child of", "Someone already added"), not data-model terms.

## Where we are
- Phase A (editing and data model) is done.
- **Phase B (navigation) is done** (merged to `main` 9 Oct 2026):
  - done: zoom, pan and fit (V1); search and centre (V3); focus mode with separate up/down depths and a direct / + siblings / all relatives width switch (V3, V4). Focus is kept in the page address (`#focus=…&up=…&down=…&w=…`) and filters every tab.
  - done: saved views (V5/V6), shown as chips under the header (`ViewBar.svelte`, `model/views.ts`). One rule per view: a focus (`scope.root` + `up`/`down`/`width`, absent depth = all generations), a tag, or a hand-picked `people` list. Opening a focus view fills the focus bar; changes show "Update view". The open view is in the page address too (`#view=…`).
  - done: collapse to one person (a 0/0 focus shows only that person, no partners) and Reset to an empty canvas (`app.blank`, `#start`) (V2).
- **Phase C (tree layout) is done** (merged to `main` 9 Oct 2026): our own layout (V8), line hops (V9) and animated transitions (V11). Layout rules:
  - centred; in a focus view the focus person is at x = 0, so the view grows around them
  - father on the left for a couple (unless both partners' parents are in view and placed the other way round: free-standing parents are moved, otherwise the couple swaps, so lines never cross); someone with several partners sits between them, earlier partnerships on the left (three or more: the first half on the left), each partner's other partners further out; partners with someone between them get a raised line, and their children's line drops just inside the outer partner
  - siblings grouped and ordered by age; each family's children hang under their own couple
  - strict age order, always; when both partners' parents are in view, the spouse's siblings go beyond the other family's children (on their parents' side if those are already placed, else the spouse's side). When two families intermarry more than once, the spouse joins their partner within one family's run and their own parents' line reaches over (e.g. Josiah Wedgwood III beside Caroline Darwin)
  - a partner's parents are placed above them (e.g. the Murphys above Bridget)
  - families whose children's lines would overlap get separate heights; lines hop where they cross
  - nothing ordered by when it was added (the layout is the same whatever order people and families were stored in)
- **Phase D (places, photos, map) is done** (merged to `main` 9 Oct 2026):
  - D1: browser store on IndexedDB (`storage/index.ts`), with backups that include photos.
  - G6: place lookup with Nominatim (`places/nominatim.ts`, one request a second, cached), keeping coordinates, OSM and Wikidata ids; `model/places.ts`; place field `PlaceInput.svelte` and editor `PlaceDetails.svelte`.
  - V10: photos (`media/images.ts` resizes to 800px, shrinking by halves so it stays smooth, plus a 192px thumbnail (older small ones are remade on load); `model/media.ts`); silhouettes; a Photos toggle for compact cards.
  - V12: Map tab (`MapView.svelte`, `layout/map.ts`): MapLibre globe with OpenFreeMap tiles. MapLibre's worker URL is set explicitly (`setWorkerUrl`), which the Vite dev server needs.
- **Phase E** in progress: E3 blank first run with "Load the demo family" and E4 the Darwin–Wedgwood demo (`src/lib/data/demo-darwin.json`, built by `scripts/data/make-demo-darwin.py`; the Smith sample `example-data.json` stays as the test fixture) are done. E5 (persistent storage, backup reminder: `storage/safety.ts`) and E6 (GitHub Pages) are done: live at https://bothness.github.io/family-tree/, deployed by `.github/workflows/deploy.yml` on every push to `main`. E1 GEDCOM export (`export/gedcom.ts`) and E2 ZIP export (`export/zip.ts`, which "Open backup file" also reads) are done. V13/V14 done: a Vertical tree (narrow cards, photo above the name) or a Horizontal one (left to right, the wide cards), from the zoom bar; a horizontal tree is the layout worked out on its side and flipped (`layout/tree.ts`). Next: Phase F, the shared family edition (see ROADMAP): F1 merging (`src/lib/sync/merge.ts`), F2 sync (`sync/engine.ts`, built in with `SYNC=cloudflare`, which sets `__SYNC__`) and F3 the server (`server/`, `functions/`, `wrangler.toml`; D1 for the version list and users, R2 for each version and photos) are done; then F4 Google sign-in (written ourselves) and F5 deploy.
