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

## Phones (options to explore) · Interface
From a review at phone width (390px) on 10 Oct, with the demo loaded. These are options to try on a real phone and narrow down, not decisions yet. What was found: the header, view chips and focus bar take about a third of the screen; the person panel covers about 80% and hides the card that was tapped; text inputs are 14–15px, so iOS Safari zooms in on every field; many buttons are 20–26px tall (the usual minimum for touch is 44); the tree opens fitted to its full width (13% on the demo, unreadable).

**Screen space**
| # | Option | Notes |
|---|---|---|
| M1 | **Bottom tab bar** | Tree / Timeline / Map / Research to-do move to a bar at the bottom, as in most phone apps; the header keeps the name, search, + New person and Data |
| M2 | **Search as an icon** | A magnifier that opens a full-width search, instead of the search box taking its own row |
| M3 | **Views and focus in one row** | The view chips and the focus bar merged into one line, with the focus controls (up/down depth, width) behind a "Focus" chip that opens a small sheet |
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
| M15 | **Timeline: names stay put** | Names pinned on the left while the years scroll, and pinch to stretch the time axis |

## Public, browser-only edition · Product
Already built as a build setting of the same app (the GitHub Pages site): browser storage on IndexedDB behind `DataStore`, backups with photos, persistent storage and backup reminders, privacy wording, static deploy. Still to think about before inviting the public:
- **Place lookup at scale:** Nominatim's public service allows at most one request a second in total across all of an app's users. Fine for one family; a public edition with many users may need another geocoding service (e.g. Photon, or a commercial one) or our own caching proxy. The lookup stays behind `places/` so it can be swapped.
- **Multi-editor features stay optional:** anything needing accounts goes behind the sync layer.
