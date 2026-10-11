# Data, dates, places and exports

The data model and everything that reads or writes it without drawing it: `model/`, `export/`, `places/`, `media/`, `storage/`, `data/`, `schema/`, `scripts/`. Plain TypeScript, no Svelte. Every function takes the `Dataset` explicitly. The full model, field by field, is in `docs/MODEL.md`.

## Essentials
- Schema version `0.2`; `migrate()` upgrades v0.1 (prototype exports) and older shapes within v0.2.
- **Uncertainty is per fact**: names, dates, partnerships and parent–child links each have `status: confirmed | likely | guess | conflicting`. The UI shows Confirmed / Likely / Guess.
- **Research state is per person**: `research.stage` (sketch / in-progress / researched) and `todo[]`.
- **Dates are EDTF strings** (`1858~`, `188X`, `../1901`, `1901/1911`). `parseUserDate` (`edtf.ts`) turns everyday forms into EDTF: "c.1858", "1880s", "before 1901", "1901–1911", `YYYY-MM-DD`, "12 Feb 1809" / "12 February 1809", "Feb 1809". Qualifiers only go before years; no "st/nd/th"; years are four digits; impossible days are refused.
- **Families** have 0–2 partners plus children. Each child is in exactly one family; a parent can be in several (half-siblings). `childrenComplete` and `expectedChildren` record known gaps.
- Birth and death are events. Other life events stay in the model but are hidden from the UI.
- `knownAs` shows on the tree; `notes` is the biography; `sourceNotes` holds free-text sources.
- `deceased: true`, or absent (living or not known). Born over 110 years ago counts as probably deceased.
- **Derived data is never stored** (date ranges, generations, branches, gaps).

## Files
- `types.ts` mirrors `schema/family-tree.schema.json`. **When the model changes, update together:** `types.ts`, the schema, `migrate.ts`, `src/lib/data/example-data.json` (the test fixture), `docs/MODEL.md`, and the GEDCOM export if the field carries over.
- `queries.ts` read-only lookups · `mutations.ts` in-place changes · `edtf.ts` dates · `gaps.ts` research to-do · `focus.ts` who a focus view shows · `views.ts` saved views · `places.ts` places · `media.ts` photo entries.
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
