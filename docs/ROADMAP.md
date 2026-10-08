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

## Phase B – Navigation
| # | Change |
|---|---|
| V1 | Zoom in and out, pan, fit all |
| V3 | Search for a person, then centre on them, or focus: show only them ± N generations |
| V4 | Show or hide siblings in focus mode (hides siblings at every generation, and partners who aren't related to the focus person) |
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
