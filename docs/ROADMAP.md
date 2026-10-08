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

## Phase B – Navigation (V1, V3, V4 done 8 Oct 2026; V5/V6 and V2 next)
| # | Change |
|---|---|
| V1 | Zoom in and out, pan, fit all. Trackpad: pinch zooms, two-finger scroll pans. Mouse: wheel zooms at the cursor, drag pans. Touch: pinch and drag. Plus +/−/0 keys and on-screen −/+/Fit buttons. The view only re-fits on load, Fit, search or focus changes, never on ordinary edits |
| V3 | Search for a person (all names, including maiden names and "Known as"), then centre on them, or focus: show only them, N generations up and M down. Focus filters every view (tree, timeline, to-do, and later the map). Markers at the edge of a focus ("↑ parents", "+3 descendants") extend it one generation, so the numbers rarely need setting by hand |
| V4 | Focus width, one three-way switch: **Direct line** (ancestors, descendants, co-parent partners) · **+ Siblings** (siblings of everyone on the direct line, half-siblings included) · **All relatives** (also their descendants, i.e. cousins, nieces and nephews, only where the shared ancestor is in view and no deeper than the "down" depth) |
| V5 + V6 | Branches are named **saved views**, created either from a filter (e.g. descendants of John Smith, ancestors of Bridget, a tag) or by hand-picking people. No auto-naming of unconnected groups |
| V2 | Two controls: collapse the view to one person, and reset to a blank view with nobody selected |

## Phase C – Tree layout
| # | Change |
|---|---|
| V8 | Correct grouping of sibling sets either side of a couple; separate connector levels so half-sibling groups are clearly bracketed |
| V9 | Line "hops" where connectors cross (circuit-diagram style) |

Decision: **build our own layout**, borrowing ideas from existing libraries. Rules to follow: centred rather than left-aligned; father consistently on one side and mother on the other; siblings grouped together and ordered by age; nothing ordered by when it was added.

Approach: focus mode (Phase B) is the main view, as on Ancestry and FamilySearch. Neither service tries to draw everyone at once; both centre on one person and expand from there. A tree around one person lays out cleanly, which avoids most crossings. The "everyone" view then needs a proper layered-graph layout (build our own, or use ELK.js or the family-chart library), with separate connector levels per family and hops at crossings.

## Phase D – Places and images
| # | Change | Notes |
|---|---|---|
| G6 | Places looked up via Nominatim (OpenStreetMap) or Wikidata, with coordinates; editable names and custom/historical places | Model already has coordinates, Wikidata and dated `altNames`. Add `osmId`. **The prototype page can't call outside APIs**, so live lookup probably needs the deployed app (or a small proxy function on Netlify or Cloudflare) |
| V10 | Photos on cards, with sex-based silhouette fallback, plus a compact mode without images | Add a minimal `Media` entity and `person.photo`. The prototype can hold small resized thumbnails in the browser; the real app stores them in R2 or the repo |

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
- 8 Oct: a focus with up 0 and down 0 still shows the person's partners. Whether V2 "collapse to one person" hides them too is still to decide.
