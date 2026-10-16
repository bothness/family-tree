# Interface

Everything the user sees and touches: `components/`, `src/routes/+page.svelte` (the app shell), `app.svelte.ts` (shared state), `src/app.css` (all styles), `src/app.html` (title, icons, sharing tags), `static/`. Requests here are often cross-cutting, so keep things visually consistent across tabs, panels and dialogs.

## Design language
- **Ink and pencil.** Confirmed facts are drawn in ink (`--f-name`, Alegreya, a serif). Guesses are in pencil (`--f-pencil`, Caveat, handwritten, `--pencil` grey). UI text is `--f-ui` (Alegreya Sans). Likely or guessed links are dashed lines; so, for now, are lines to adopted children ("This is an adoptive relationship" under the parent link). A couple who divorced, separated or had the marriage annulled have a "/" across their line.
- **Tokens only** (`:root` in `app.css`): `--paper` (background), `--sheet` (panels), `--ink`, `--ink-soft`, `--pencil`, `--rule` (borders), `--accent` (green: primary buttons, focus rings, research dots), `--warn`. Dark theme is the same tokens redefined, so never hard-code colours.
- **All styles live in `app.css`**, as plain classes (`.btn`, `.btn.primary`, `.btn.small`, `.linkish`, `.seg` switches, `.dialog`, `.overlay`, `.sheet`, `.zoombar`/`.zgroup`, …). Reuse an existing class before adding one. Components have almost no `<style>` blocks.
- Complex keyboard and accessibility widgets use **Bits UI** (headless), styled with our classes. No styled UI kits.
- **Plain language** in the UI ("Child of", "Someone already added", "This is a guess"), never data-model terms.
- **Gaps stay visible**: pencil for guesses, dashed lines for uncertain links, grey dashed placeholders for missing children ("+2 more expected" plain when a count was recorded, a pencilled "more children?" otherwise), the research dot (bottom right of a card; filled = researched, firmer half = in progress), and the Research to-do tab.
- **Sketching stays quick**: extra detail is optional and tucked away (accordions, "+ Another name"), never in the way of adding someone.
- Placeholder faces: Material Symbols (`Silhouette.svelte`). Status switches (Confirmed / Likely / Guess, Sketch / In progress / Researched) are `StatusPicker`-style `.seg` groups that keep their own width.

## Map of the app
- `+page.svelte`: header (name, + New person, Data, Saved; tabs and search), `ViewBar` (saved-view chips and the focus bar), the current tab, and the person panel.
- `app.svelte.ts`: one `AppState` (`app`): `data` (the dataset, a deep `$state` proxy), `tab`, `selected`, focus and open view (both kept in the page address: `#focus=…&up=…&down=…&w=…`, `#view=…`, `#start`), `canEdit` (false for viewers in the family edition), photo helpers.
- Animation (V11): cards keyed by person glide to new positions, newcomers fade in, leavers go at once; lines are re-routed on in-between positions (up to 600 lines; above that they slide with the cards and the hops come back at the end); nothing animates with over 400 cards on screen; "reduce motion" is respected.
- Larger trees (`TreeView`): over 300 people in view, the layout runs in a worker (`layout/worker.ts`) and the old drawing stays until it answers; over 200 cards, only what's on screen plus half a screen each way is drawn (the box moves only when the view leaves it). Cards read people and their birth and death events from lookups made once per change (`byId`, `lifeEvents`), never `person()`/`lifeEvent()` per card. A tree of over 300 people opens on a focus view (`app.openTree()`, `startingPerson`).
- Tabs: `TreeView` (draws the layout from `src/lib/layout/`: cards, lines, pan/zoom/fit, animation, zoom bar with Fit, the Photos switch and the Vertical/Horizontal menu), `TimelineView` (bars, plus a symbol for each dated marriage, divorce and child's birth, with its own legend; hover draws a line to the partner or child. The bars scroll in their own box with both scroll bars; the wheel or a pinch zooms only the time axis at the pointer, dragging pans, as on the tree), `MapView` (MapLibre globe, OpenFreeMap tiles, no borders or country names; its worker URL is set explicitly with `setWorkerUrl`, which the Vite dev server needs; dots from `layout/map.ts` grow as you zoom; places close together are grouped by `clusterPlaces`, a ringed dot counting people once, and a click zooms in until the group parts; an open place draws lines to where its people died or were born, `placeLinks`, merged per group at the current zoom by `linksAtLevel`, with a tooltip on hover), `TodoView`.
- Person panel: `PersonSheet` (editing), `PersonView` (read-only, for viewers), `AddRelative`, `PlaceInput` (a birth or death place, or with `fid` where a couple married)/`PlaceDetails`, `SourceList` (sources, shared: pick one already in the tree or add one; a person's note on it. Each is a card that opens in place to edit, with its web link as a separate pill; a new one opens with its name selected), `PhotoPicker` + `CropDialog`. A right-hand panel on wide screens, a bottom sheet under 760px. It closes with the × or a click on empty canvas.
- Dialogs: `DataDialog` (backup, open, exports with "only the current view", demo), `AccessDialog` and `SignIn` (family edition), `BlankPrompt` (first run).

## Conventions
- Interaction (tree; the timeline the same but zooming only the years): wheel zooms at the cursor (Safari: the wheel scrolls, ⌘ + wheel zooms); drag or middle-button drag pans; pinch zooms; +/−/0 keys. The view re-fits only on load, Fit, search or focus changes, never on ordinary edits.
- On touch screens (`pointer: coarse`) the zoom buttons are hidden; the bottom controls scroll sideways if they don't fit.
- Widths (header and bars; the comment above `.top` in `app.css` has the detail): 1200 and up one header row with full labels; 900–1199 one row with "To-do" (and "+" alone to 1099), only the search box giving way; 480–899 two rows (`.top-a` name and buttons, `.top-b` tabs and search box; they're `display:contents` above 900) with the focus bar behind a Focus chip in `ViewBar` that opens it as a bottom sheet (`.focusbar.open`, `.narrow-only` labels); under 480 the tabs fill their row and `SearchBox` hides behind a magnifier. The view chips are one scrolling row at every width. The person panel becomes a bottom sheet under 760px.
- The tree's legend lives on the tree (`TreeView`, `.tree-legend`), bottom left: a card when the canvas is 1100px or wider (a container query, so an open panel counts), otherwise a "Legend" button that opens it. The timeline has its own.
- Never trigger `alert`/`confirm`: in-page confirmations only.

## Checking in a browser
- Run a separate dev server for checks, `npm run dev -- --port 5200 --strictPort` (in the background), so as not to disturb the owner's own servers. Open it in a **new** tab, "Load the demo family", and clear its storage when done (`localStorage.clear()` and delete the IndexedDB databases), then close the tab.
- Phone width: if the window won't resize, replace the page with an `<iframe src="/" style="width:390px;height:700px">` and look at that.
- A file input can be fed from the page: build a `File` (e.g. from a canvas), put it in a `DataTransfer`, set `input.files` and dispatch `change`.

## Open issues
- Re-crop a photo that's already kept. Self-host the fonts. The demo opens too wide to read. Phone options M4–M15 (all in `docs/ROADMAP.md`).
