# Family tree data model – v0.2

Files: `family-tree.schema.json` (JSON Schema 2020-12), `example-data.json` (sample data), `validate.mjs` (validator + gaps report).
Run: `npm i ajv ajv-formats && node validate.mjs example-data.json`

## Entities
| Entity | Purpose | Drives |
|---|---|---|
| **Person** | Names (multiple, typed), sex, Wikidata/URL links, tags, research stage + to-dos | Every view |
| **Family** | Up to two partners + children; whether the children list is complete; expected child count | Tree |
| **Event** | Birth, marriage, census, residence, occupation, migration… with date, place and participants (with roles) | Timeline, map, person page |
| **Place** | Hierarchy (parent), coordinates, historical/alternative names, Wikidata | Map, place grouping |
| **Source** | Certificate, census, oral account… with reliability | Evidence, gaps |
| **View** | Saved, named filter. One rule: a focus (root + up/down generations + width), tags, or a hand-picked people list | Saved views (chips under the header); filter every tab |

## Key decisions
- **Uncertainty is per fact.** Names, dates, places, partnerships, child links and events each carry `status`: `confirmed | likely | guess | conflicting`, plus optional `citations`.
- **Research state is per entity**, separate from confidence: `research.stage` = `sketch | in-progress | researched`, plus free-text `todo`.
- **Incompleteness is explicit.** `childrenComplete: yes | no | unknown` and `expectedChildren` (e.g. from the 1911 census "children born alive" column). Families may have 0–2 known partners; `placeholder` people stand in for unknowns.
- **Dates use EDTF** (`1858~`, `1888?`, `188X`, `../1901`, `1901/1911`). The app derives sortable start/end values for timelines; these are never stored.
- **Events are first-class with participants**, so one census or marriage record links several people, and spans (residence, occupation) appear as bars on a timeline.
- **One graph, many views.** Separate branches simply coexist until joined; views store queries, never copies of data.
- **Ready for multiple editors.** Opaque prefixed IDs (`per_`, `fam_`, `evt_`…; use ULIDs in the app), optional `meta` provenance, no derived data stored, and the same model works as one file, a file per entity, or SQL tables.

## Changes in v0.2
- `probable` renamed `likely`.
- Person: `living` replaced by `deceased` (true, or absent = living/not known; born over 110 years ago is treated as probably deceased). New `knownAs` (shown on the tree) and `sourceNotes` (free-text sources). `notes` is the biography. Sex is `M | F | U`.
- Name: new `deed-poll` type and `date` (when the name came into use).
- Family `relationship`: new `start`, `end` and `endReason` (death, divorce, separation, annulment, unknown). Marriage events are folded into `relationship.start`.
- Half-siblings: each child belongs to exactly one family; a parent can be in several families (e.g. John + Mary, John + unknown).
- The prototype upgrades v0.1 data automatically.

## View scope (changed within v0.2, 9 Oct 2026)
- `scope.root` + `up` / `down` (generations of ancestors / descendants; absent = all) + `width`: `direct` (ancestors, descendants and their partners), `siblings` (also the other children of every ancestor shown), `all` (also those siblings' descendants, no deeper than `down`). "Descendants of X" is `up: 0` with no `down`; "Ancestors of X" is `down: 0` with no `up`.
- `scope.tags`: everyone with any of these tags. `scope.people`: a hand-picked list.
- Replaces the earlier `direction`, `generations` and `includeSpouses`; `migrate()` converts them.

## Places (added within v0.2, 9 Oct 2026)
- `place.context`: the wider area shown after the name ("West Yorkshire, England"), filled in by the lookup and editable.
- `links.osm`: the OpenStreetMap object ("relation/118362"); with `coordinates` and `links.wikidata` it comes from the Nominatim lookup. A place without them was written by hand.
- Places found by lookup are reused by OSM id; a hand-written place can be linked in place ("Find on the map"), which updates every event using it, keeping its own name (the lookup's name becomes another name).

## Photos (added within v0.2, 9 Oct 2026)
- `media[]`: `Media { id, kind: 'image', mime, width, height, thumb, caption? }`; `person.photo` is a Media id.
- Only a resized copy is kept (longest side 800px, JPEG), never the original. The image itself is stored apart from the dataset (IndexedDB in the browser) under its id; `thumb` is a small square data: URL for tree cards, so cards show without loading files.
- Backups (Data → Download backup) are the dataset plus `mediaFiles` (each image as a data: URL), so one file holds everything. `mediaFiles` isn't part of the schema; it's removed when a backup is loaded.

## Derived (computed, not stored)
Sortable date ranges, generations, connected branches, and the gaps report (guesses, unsourced events, open families, placeholders, missing births).

## Open questions
- Living people: privacy rules for wider sharing
- Should anything beyond birth and death come back as events (e.g. residence for maps)?
- Media (photos, scans): a `Media` entity linked to people, events and sources?
- Conflicting facts: store alternative values side by side (e.g. two birth events, each `conflicting`)?
- Storage: GitHub (JSON files) vs Cloudflare D1, to decide after the interface; whichever is chosen, it syncs on top of a browser store, since a browser-only edition is planned (see ROADMAP, "Later")
