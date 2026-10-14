# Data, dates, places and exports

The data model and everything that reads or writes it without drawing it: `model/`, `export/`, `places/`, `media/`, `storage/`, `data/`, `schema/`, `scripts/`. Plain TypeScript, no Svelte. Every function takes the `Dataset` explicitly. The full model, field by field, is in `docs/MODEL.md`.

## Essentials
- Schema version `0.3` (released 12 Oct 2026). `migrate()` upgrades v0.1 (prototype exports) and older shapes within v0.2, and reads v0.2 as it is. Breaking changes are converted once, outside the app, by `scripts/migrate-0.3.mjs` (one step per change; how the cutover went is in `docs/DECISIONS.md`). The next breaking change gets its own script, run the same way.
- **Uncertainty is per fact**: names, places, partnerships and parent–child links each have `status: confirmed | likely | guess | conflicting`; the UI shows Confirmed / Likely / Guess. **Dates carry it in the EDTF itself**: `1858?` not sure, `1858%` about and not sure, `[1800,1801]` one of these (sources disagree) are pencil (`dateUnsure`, `datesDisagree`); `1858~` (about) is ink.
- **Research state is per person**: `research.stage` (sketch / in-progress / researched) and `todo[]`.
- **Dates are EDTF strings** (`1858~`, `188X`, `../1901`, `1901/1911`). `parseUserDate` (`edtf.ts`) turns everyday forms into EDTF: "c.1858", "1880s", "before 1901", "1901–1911", `YYYY-MM-DD`, "12 Feb 1809" / "12 February 1809", "Feb 1809". Also "maybe 1858" / "1858?", "c. Feb 1858", "before 1901?", "1858 or 1859", "19 or 20 Aug 1960" (earlier parts borrow the month and year of the last). No "st/nd/th"; years are four digits; impossible days are refused. `fmtDate` shows each form so that `parseUserDate` reads it back. `unsureDate` adds the not-sure mark. The help page for users is `static/dates.html` ("Uncertain dates?" under the birth date).
- **Families** have 0–2 partners plus children. Each child is in exactly one family; a parent can be in several (half-siblings). `childrenComplete` and `expectedChildren` record known gaps.
- Birth and death are events. Other life events stay in the model but are hidden from the UI. Where a couple married is `relationship.place` (`setFamilyPlace`), a `PlaceRef` like an event's place; `placeUses`, `mergePlaces`, `prunePlaces`, the map and merging all count it.
- **Names**: `names[0]` is the main name, the one they were born with (`primaryName`). One other name may be `preferred`: shown on the tree instead (`shownName`), e.g. a married name. `knownAs` is a nickname or title; one word takes the shown surname (`displayName`). `notes` is the biography.
- **Sources** (`sources.ts`) are shared like places: `Source { type, title, url?, date? }`, cited from a person as `citations: [{ sourceId, detail? }]`. `sourceFromText` turns typed text or a pasted link into a new source (type and title from the site). Sources no one cites and places nothing uses are removed by `prune` (and `uncite`, `setLife`, `setLifePlace`); merging brings one back if the other side just used it.
- `deceased: true`, or absent (living or not known). Born over 110 years ago counts as probably deceased.
- **Derived data is never stored** (date ranges, generations, branches, gaps).

## Files
- `types.ts` mirrors `schema/family-tree.schema.json`. **When the model changes, update together:** `types.ts`, the schema, `migrate.ts`, `src/lib/data/example-data.json` (the test fixture), `docs/MODEL.md`, and the GEDCOM export if the field carries over.
- `queries.ts` read-only lookups · `mutations.ts` in-place changes · `edtf.ts` dates · `gaps.ts` research to-do · `focus.ts` who a focus view shows · `views.ts` saved views · `places.ts` places · `sources.ts` sources · `media.ts` photo entries · `subset.ts` part of a tree, for exporting only the current view.
- `places/nominatim.ts`: OpenStreetMap place search, called from the browser. At most one request a second, cached, and only when asked ("Search OpenStreetMap for …"): Nominatim's policy forbids search-as-you-type.
- `media/images.ts` resizes photos (800px, halving in steps so it stays smooth, plus a 192px square thumbnail); `media/crop.ts` is the square-crop maths.
- `storage/`: the `DataStore` interface (async; the dataset plus photo files) on IndexedDB, falling back to localStorage. `safety.ts`: persistent storage and backup reminders. The app must work fully with no server: sync is a layer on top (`src/lib/sync/`, see `server/CLAUDE.md`).
- `export/gedcom.ts` (GEDCOM 5.5.1, lossy, says so in the dialog) and `export/zip.ts` (JSON + GEDCOM + `photos/`; "Open backup file" reads it back).
- `data/demo-darwin.json`, the Darwin–Wedgwood demo, is built by `scripts/data/make-demo-darwin.py`, where every fact has a source. Edit the script, not the JSON. `example-data.json` (the Smiths) is the test fixture.
- `npm run validate [file.json]`: schema check and research-gaps report.

## Pitfalls and tests
- **`$state` proxy pitfall**: pushing an object into the dataset stores a proxied copy, so never keep editing the original afterwards. Take the stored element back (`d.families.at(-1)!`), as `newFamily` / `newPerson` / `setLife` do. Plain-object tests can't catch this; tests that need real proxies are `*.svelte.test.ts` files starting with `// @vitest-environment happy-dom` (see `mutations.svelte.test.ts`).
- Test with small hand-built datasets (see `mutations.test.ts`, `emptyDataset()`).
- Anything that changes the dataset's shape also affects merging (`sync/merge.ts` merges item by item by id) and its tests.

## Open issues
- GEDCOM import (export only for now).
- Open questions in `docs/MODEL.md` (privacy rules for living people, conflicting facts side by side).
