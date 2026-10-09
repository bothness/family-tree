# Family tree app – roadmap

Feedback from testing prototype v1 (8 Oct 2026). Item codes: **G** = general changes, **V** = visual display and navigation.

## Phase A – Editing and data model (schema v0.2) ✅ done 8 Oct 2026
Also added: "Known as" name shown on the tree; biography/notes and free-text sources fields; links (Wikidata, URLs) and tags kept; children sorted by age and men placed left of partners in the interim layout; living people's timeline bars run to today (V7, brought forward).

| # | Change | Model impact |
|---|---|---|
| G1 | Delete button always visible | – |
| G2 | Remove life events from the UI | None. Events stay in the model; birth and death are still events underneath |
| G11 | Status labels: confirmed / likely / guess | Rename `probable` → `likely` |
| G5 | Sex: male / female / unknown | Already in the model (`sex.value`), needs UI only |
| G8 | "Deceased" checkbox reveals death date and place | `living` becomes `deceased: true / false / unknown`. Suggest assuming deceased if born over 110 years ago |
| G10 | Previous names (maiden name, deed poll, etc.) | Already supported (`names[]` with types). Add `deed-poll` type and an optional date the name changed |
| G7 + G9 | Start and end dates for marriages and partnerships | Add `relationship.start`, `relationship.end` and `endReason` (death / divorce / separation / unknown) to Family |
| G3 | Link to people who already exist; link a new partner to existing children | UI only: "+ Parent / Partner / Child" offers "new person" or "pick existing" |
| G4 | Siblings share parents by default; half-siblings can be split off | Model already handles this (each child sits in one specific family). UI: "Parents: [this couple ▾]" lets you move a child to a different family, e.g. father + unknown mother |

## Phase B – Navigation ✅ done 9 Oct 2026
| # | Change |
|---|---|
| V1 | Zoom in and out, pan, fit all. Trackpad: pinch zooms, two-finger scroll pans. Mouse: wheel zooms at the cursor, drag pans. Touch: pinch and drag. Plus +/−/0 keys and on-screen −/+/Fit buttons. The view only re-fits on load, Fit, search or focus changes, never on ordinary edits |
| V3 | Search for a person (all names, including maiden names and "Known as"), then centre on them, or focus: show only them, N generations up and M down. Focus filters every view (tree, timeline, to-do, and later the map). Markers at the edge of a focus ("↑ parents", "+3 descendants") extend it one generation, so the numbers rarely need setting by hand |
| V4 | Focus width, one three-way switch: **Direct line** (ancestors, descendants, co-parent partners) · **+ Siblings** (siblings of everyone on the direct line, half-siblings included) · **All relatives** (also their descendants, i.e. cousins, nieces and nephews, only where the shared ancestor is in view and no deeper than the "down" depth) |
| V5 + V6 | Branches are named **saved views**, created either from a filter (e.g. descendants of John Smith, ancestors of Bridget, a tag) or by hand-picking people. No auto-naming of unconnected groups |
| V2 | Two controls: collapse the view to one person, and reset to a blank view with nobody selected |

## Phase C – Tree layout ✅ done 9 Oct 2026
| # | Change |
|---|---|
| V8 | Correct grouping of sibling sets either side of a couple; separate connector levels so half-sibling groups are clearly bracketed |
| V9 | Line "hops" where connectors cross (circuit-diagram style) |
| V11 | Animate the tree from one state to the next when the selection, focus or view changes: cards that stay glide to their new positions, people entering or leaving fade in and out, and the camera eases to its new framing. Probably Svelte's motion tools (`Tween`/`Spring` for positions, `fade` transitions for entering and leaving cards), keyed by person so each card keeps its identity. Respect "reduce motion" settings |

Note for V11: a layout that is stable between states (the same person lands in a similar place when the focus widens) makes animation read well, so design the layout with V11 in mind.

Decision: **build our own layout**, borrowing ideas from existing libraries. Rules to follow: centred rather than left-aligned; father consistently on one side and mother on the other; siblings grouped together and ordered by age; nothing ordered by when it was added.

Approach: focus mode (Phase B) is the main view, as on Ancestry and FamilySearch. Neither service tries to draw everyone at once; both centre on one person and expand from there. A tree around one person lays out cleanly, which avoids most crossings. The "everyone" view then needs a proper layered-graph layout (build our own, or use ELK.js or the family-chart library), with separate connector levels per family and hops at crossings.

## Phase D – Places, images and map
Order: D1 browser store on IndexedDB → D2 place lookup (G6) → D3 photos (V10) → D4 map (V12).

| # | Change | Notes |
|---|---|---|
| D1 | Move the browser store from localStorage to IndexedDB, behind the same `DataStore` interface | Room for photos (localStorage is ~5 MB); existing data moves across automatically. Prerequisite for V10 and the browser-only edition |
| G6 | Places looked up as you type: **Nominatim** (OpenStreetMap) search, keeping coordinates, the OSM id and the **Wikidata id** OSM gives (`extratags.wikidata`); editable names, dated historical names, and free-text/custom places still allowed | Called directly from the browser (allowed by Nominatim's policy at low volume): one request a second at most, sent after a pause in typing, results cached. Add `links.osm` to Place |
| V10 | Photos on cards, with a silhouette fallback, plus a compact mode without images | Minimal `Media` entity and `person.photo`. **Only a resized copy is kept** (about 800px, plus a small card thumbnail), never the original. Stored in IndexedDB; exports include them so one file is a full backup |
| V12 | Map view: a **MapLibre** globe with **OpenFreeMap** vector tiles, showing where events happened; filtered by the current focus or view like every other tab | Uses place coordinates from G6. Clicking a place lists who was born or died there; clicking a person opens them |

## Later – A public, browser-only edition
Once the app is complete: a version anyone can use to build their own family tree, with all data kept in their browser (no account, no server). Possibly a fork, but better as a build setting of the same app so the two don't drift apart.

What this means for decisions made before then:
- **Storage stays behind the `DataStore` interface**, with a browser store as a first-class option, not just a fallback. Any sync with a back end (GitHub files, Cloudflare D1) is an extra layer on top, so the app works fully with no server.
- **Browser storage needs more room:** localStorage holds about 5 MB, which photos (V10) would quickly fill. Move the browser store to IndexedDB, with images kept as blobs there.
- **Export and import are the backup:** with no server, the Data dialog's JSON download and upload is how people keep and move their tree. Consider a single-file export that includes photos, and a gentle reminder to back up.
- **No server-only features:** place lookup (G6) must be able to call Nominatim or Wikidata directly from the browser (both allow it, within usage limits), not only through our own proxy.
- **Multi-editor features stay optional:** `meta` provenance and IDs already work for a single user; anything needing accounts goes behind the sync layer.
- **Privacy wording:** say plainly that data stays on this device, and that clearing browser data deletes it unless exported.

## Decisions log
- 8 Oct: V2 = both "collapse to one person" and "reset to blank view".
- 8 Oct: branches = named saved views, from filters or hand-picked; no auto-naming.
- 8 Oct: own tree layout, informed by other libraries.
- 8 Oct: life events removed from UI (model keeps birth/death as events); notes, free-text sources, links and tags kept; "Known as" added.
- 8 Oct: focus has separate "up" and "down" depths plus a width switch (direct line / + siblings / all relatives), which also covers V4. Focus is screen state for now; `View.scope` gains `up`, `down` and width when saved views (V5) are built.
- 8 Oct: focus filters all views (tree, timeline, to-do, future map).
- 8 Oct: pan/zoom by hand (no d3-zoom). Mouse wheel zooms, trackpad scroll pans, pinch zooms; ⌘/Ctrl + scroll always zooms.
- 8 Oct: no Material UI or styled kit, as it would override the ink/pencil design. Use Bits UI (headless, unstyled) for complex widgets such as the search dropdown, styled with our own tokens.
- 8 Oct: search only centres. Someone hidden by the current focus gets their person panel with "Show in full tree" / "Focus on them"; the view doesn't change by itself. Focus is started from the panel's Focus button (or F).
- 8 Oct: focus is kept in the page address, so Back undoes a focus change and a focus view can be bookmarked.
- 8 Oct: the orange missing-children placeholder only shows when every known child is in view; children hidden by focus get an edge marker ("+2 children") instead.
- 8 Oct: a focus with up 0 and down 0 still shows the person's partners. (Superseded 9 Oct: see below.)
- 8 Oct: when a relative added from the person panel falls outside the focus, the notice offers "Expand view" (the smallest change to up/down/width that shows them) or "Focus on them". It falls back to "Show in full tree" only when no widening can include them (e.g. a partner's parents). The notice clears when the panel closes or the focus changes.
- 9 Oct: saved views are chips under the header (replacing the auto-detected branch chips), with "Everyone" first and "+ New view". One rule per view: a focus (root + up/down/width; "all generations" = no limit stored), everyone with a tag, or a hand-picked list. Descendants / Ancestors of someone are focus views (from the person panel's Focus ▾ menu). Changes to an open focus view are saved only with "Update view". Combining rules comes later.
- 9 Oct: missing-children placeholders are orange only when an expected count was recorded; otherwise a pencilled "more children?".
- 9 Oct: V2 "collapse to one person" = focus with 0 generations up and down, which shows only that person (no partners); the ↑/↓ markers expand from there. Available from the focus bar (Collapse) and the person panel (Focus ▾ → Only …).
- 9 Oct: V2 "reset" leaves an empty canvas with nobody selected (`#start` in the address) and a prompt to search, open a saved view or show everyone. Choosing someone in search from the empty canvas focuses on them (elsewhere search only centres).
- 9 Oct: added V11 (animated transitions between tree states) to Phase C, since it depends on how the new layout positions people.
- 9 Oct: someone with several partners sits between them, earliest partnership on the left (Albert – Margaret – George), so each set of children hangs under its own couple; this overrides "father on the left" for them only. A partner's parents are placed above them on the grandparents' row (the Murphys above Bridget), not as a separate group.
- 9 Oct: layout method: rows by generation; units (a person and their partners) ordered by walking down families, in-laws' parents inserted above them; x positions by alternating sweeps (children under parents, parents over children) with order and gaps kept by isotonic regression. Lines are computed from card positions alone, which is what lets V11 animate cards and re-route lines each frame.
- 9 Oct: sibling sets either side of a couple (V8): **strict age order wins** (user's call). Each family's children stay in birth order; when both partners' parents are in view, the spouse's brothers and sisters go beyond the other family's children on the spouse's side (so a line may cross, with a hop). Moving the married child to the edge facing their spouse was tried and set aside for now.
- 9 Oct: animation: people entering fade in; people leaving go at once (fading them out while others moved looked odd).
- 9 Oct: brothers and sisters recorded with no parents at all show with the "+ Siblings" (or "All relatives") setting, whatever the generations, except when collapsed.
- 9 Oct: added "Later – a public, browser-only edition": storage stays behind `DataStore` with the browser as a first-class store (IndexedDB once photos arrive); back-end sync is a layer on top; no server-only features.
- 9 Oct: Phase D: place lookup via Nominatim with Wikidata ids attached from OSM's tags; photos kept only as resized copies; a MapLibre globe map with OpenFreeMap tiles added as V12, last in Phase D since it needs place coordinates. The browser store moves to IndexedDB first (D1).
