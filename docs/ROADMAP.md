# Roadmap

Open work only, tagged by area (Layout, Data, Interface, Shared edition, Product). Finished phases and the reasons behind decisions are in `DECISIONS.md`. When something here is done, delete it (or tick it, if it's part of a set still in progress) and add a line to `DECISIONS.md`.

## Where things stand (12 Oct 2026)
- Phases A–F are done: editing and the data model, navigation and saved views, our own tree layout, places, photos and the map, exports and the demo, and the shared family edition. V13/V14 (vertical and horizontal trees) are done too.
- Schema 0.3 is released and the family edition's data converted (names, sources, dates, marriage places; see `DECISIONS.md`).
- The public edition is live at https://bothness.github.io/family-tree/ and the family edition at https://mbfamilytree.pages.dev. Every push to `main` deploys both.

## Small follow-ups
| Area | Item | Notes |
|---|---|---|
| Layout | Someone with two families where no partner is named in either: both children's lines leave from under their card and run together | `check.ts` flags it ("lines of … run along each other"). Found 10 Oct while making a test; not in the owner's tree |
| Interface | Re-crop a photo that's already kept | For now, choose the photo again. The kept copy is 800px, so a re-crop could start from that |
| Interface | Self-host the fonts | They come from Google Fonts, which tells Google the visitor's address; self-hosting would keep everything but place search and map tiles on our own site |
| Interface | The demo may be too wide to read at a glance | Charles Darwin's ten children plus spouses make a very wide row. Vertical cards (V13) helped; a smaller opening view (see M12) may help more |
| Data | GEDCOM import | Export is done (E1); import is a separate, larger job (mapping GEDCOM's forms back onto our model and certainty) |

## Larger trees
From a review on 15 Oct (L1–L6 done 16 Oct, see `DECISIONS.md`). Synthetic descendant trees timed in Node: the full layout took 0.11 s at 150 people, 0.34 s at 300, 1.9 s at 600, 11 s at 1,000 and 88 s at 2,000 (roughly cubic; in the app it's on the main thread, and real trees with more intermarriage will be slower). What counts is the largest connected group, since unconnected groups are laid out separately. In the owner's export (150 people, 32 photos) the card thumbnails are 460 KB against 221 KB for the tree itself, and they go into every save, sync and stored version. In rough order of value for effort:

| # | Area | Item | Notes |
|---|---|---|---|
| L7 | Data | **Lookup tables for queries** | `person()`, `famAsChild()`, `lifeEvent()` search whole lists. Done for the tree's cards and `gaps` (`lifeEvents`, one pass); still to do for the timeline, map, search and the person panel |
| L8 | Data | **Thumbnails out of the dataset** | `media[].thumb` (about 14 KB each as data URLs) belongs with the photo in IndexedDB (and R2), or is remade from the kept copy as `betterThumb` does. Needs a schema change and a migration of the family edition's data. At 14 KB each they'd fill the server's 25 MB limit at about 1,700 photos |
| L9 | Data | **Say when saving fails** | The localStorage fallback (no IndexedDB) swallows a full quota (about 5 MB, so a few hundred thumbnails today) and carries on unsaved. Show it |
| L10 | Data | **Drop the copy and paste box** | The Data dialog builds the whole dataset (thumbnails included) as text every time it opens. Downloads and "Open backup file" cover the same ground; pasting from the prototype is the only thing lost |
| L11 | Data | **The ZIP as the backup** | The ZIP export already holds the whole tree (`family-tree.json`, with photos as files rather than base64) plus GEDCOM, and the app opens it again. Make it the one "Download backup", with the JSON file (photos as base64 in one big string, decoded a character at a time) kept for opening old backups. Build it with fflate's async `zip` so it doesn't block the page |
| L12 | Shared edition | **Polls that send nothing when nothing changed** | Every open tab downloads the whole tree every 30 s. Send the version held; the server answers 304 if it's still the newest |
| L13 | Shared edition | **Send only what changed** | Each save PUTs the whole tree, which the server parses and re-stringifies (check Cloudflare's CPU and memory limits on large trees). `stampChanges` already finds what changed, and `merge.ts` can run on the server, so a save could send changes since `base` |

## Phones (options to explore) · Interface
From a review at phone width (390px) on 10 Oct, with the demo loaded. These are options to try on a real phone and narrow down, not decisions yet. What was found: the header, view chips and focus bar take about a third of the screen; the person panel covers about 80% and hides the card that was tapped; text inputs are 14–15px, so iOS Safari zooms in on every field; many buttons are 20–26px tall (the usual minimum for touch is 44); the tree opens fitted to its full width (13% on the demo, unreadable).

**Screen space**
| # | Option | Notes |
|---|---|---|
| M4 | **Bars hide while panning** | The bars slide away while the tree is dragged and come back on a tap or when it stops |

**Person panel**
| # | Option | Notes |
|---|---|---|
| M5 | **Sheet with snap heights** | A drag handle and three heights: peek (name, dates, photo), half and full. The tree moves so the tapped card stays visible above the sheet |
| M6 | **Read first, then edit** | On phones the panel opens as the read-only summary (as viewers see it, `PersonView.svelte`), with an Edit button per section, so the full form only shows when needed |
| M7 | **Swipe down to close** | As well as the × and tapping outside |
| M8 | **Quick add from a card** | Long-press a card for Add parent / partner / child and Focus, without opening the whole panel. Keeps sketching quick |

**Touch and typing**
| # | Option | Notes |
|---|---|---|
| M9 | **16px inputs** | Stops iOS zooming in on every field. A small CSS change (on touch screens only, if desktop should stay as it is); could be done straight away |
| M10 | **Bigger touch targets** | On touch screens only (`pointer: coarse`), at least 44px of tappable area for chips, steppers and the Confirmed / Likely / Guess switches; desktop stays compact |
| M11 | **Keyboard hints** | `inputmode` and `enterkeyhint="next"` so you can go from field to field quickly while sketching |

**Moving around**
| # | Option | Notes |
|---|---|---|
| M12 | **Open at a readable size** | On phones, start centred on the focus person at a size where names can be read, instead of fitting the whole tree; Fit still shows everything |
| M13 | **Double-tap to zoom** | Double-tap zooms in on that spot; a two-finger tap zooms out |
| M14 | **Family card view** | A phone-first alternative to the tree: one person in the middle, parents above, partners beside and children below as lists to tap through (like Ancestry's app). A new view rather than a change to the layout |
| M15 | **Timeline: names stay put** | Names pinned on the left while the years scroll (pinch to stretch the time axis is done) |

## Public, browser-only edition · Product
Already built as a build setting of the same app (the GitHub Pages site): browser storage on IndexedDB behind `DataStore`, backups with photos, persistent storage and backup reminders, privacy wording, static deploy. Still to think about before inviting the public:
- **Place lookup at scale:** Nominatim's public service allows at most one request a second in total across all of an app's users. Fine for one family; a public edition with many users may need another geocoding service (e.g. Photon, or a commercial one) or our own caching proxy. The lookup stays behind `places/` so it can be swapped.
- **Multi-editor features stay optional:** anything needing accounts goes behind the sync layer.
