# Tree layout

Pure functions: a `Dataset` and the people in view go in, card positions and lines come out. Components only draw them. No Svelte here.

## Files
- `positions.ts`: where each card goes (step 1). `layoutPositions(d, branches, root?, size)`; card sizes (`cardSize`, `NODE_W`, `PORTRAIT_W`, …) and gaps (`CARD_GAP` between partners, `SIB_GAP` between siblings, `FAM_GAP` between families, `COMP_GAP` between unconnected groups).
- `connectors.ts`: the lines (step 2), from card positions alone, so `TreeView` can re-run it on in-between positions while animating: couple lines (raised when someone sits between partners; a "/" across the middle when they divorced, separated or the marriage was annulled), drops, buses at separate heights where they'd overlap (stacked in the order with fewest hops), hops where lines cross, stubs nudged apart where a child's line would run along another family's.
- `worker.ts`: runs `layoutTree` off the page for big trees (TreeView sends a slim copy: people's ids and sex, families, birth and baptism events).
- `tree.ts`: `layoutTree` combines the two. Horizontal trees are the vertical layout worked out with the card turned on its side (`turn`), then flipped (`flip`); `routeShown` re-routes lines for the cards on screen.
- `check.ts`: `checkLayout(d, L, ids)` lists every rule a layout breaks (empty = good); `crossings()` counts crossing lines. Tests use it; it's the definition of "correct".
- `viewport.ts`: pan/zoom camera maths. `timeline.ts`, `map.ts`: the other tabs' layouts.

## Rules
Hard rules first (`check.ts` tests them), then what the layout tries for, in priority order.
- One row per generation; in a focus view the focus person is at x = 0, so the view grows around them.
- A couple sits side by side. Someone with several partners sits between them (three or more: half on each side), each partner's other partners further out. Partners with someone between them get a raised line, and their children's line drops just inside the outer partner.
- **Brothers and sisters stay together**: each family's children are one unbroken run (only their own partners may sit among them), packed side by side, the "more expected" placeholder last. Brothers and sisters whose parents aren't in view stay together too.
- When both partners' parents are in view: the couple isn't crossed under them, and at least one partner's brothers and sisters are all on their own side (when two families intermarry more than once, the spouse can join their partner within one family's run and their own parents' line reaches over: the demo's Josiah Wedgwood III beside Caroline Darwin).
- Families whose lines would overlap get separate heights; lines hop where they cross.
- Nothing is ordered by when it was added: the layout is the same whatever order people and families are stored in.

Preferences, in order (owner's call, 14 Oct: tangles matter more than conventions):
1. Fewest lines crossing (a person's own two families crossing counts double), then fewest hops when stacking lines.
2. Short lines: no needless gaps, parents near their children. Parents may sit **off-centre** over their children so brothers and sisters stay together; children with no children of their own go back under their parents where there's room.
3. Age order among brothers and sisters (unknown dates count as youngest), father on the left, earlier partnerships on the left.

## Method (`positions.ts`, numbered as in the code)
1. Generations: breadth-first from the focus person (else the earliest born); partners share a row, children go one row down.
2. Units: a person and their partners on one row, arranged by `arrange()`. Missing-children placeholders become units of their own (only when every known child is in view, and not for a branch's `noPlaceholders`: in a direct-line focus, the families the direct line was born into, from `focusSet`).
3. A first order: walk down from the earliest roots. A group that joins only below (an in-law's family) is *deferred* and inserted once there are positions to aim at, its siblings on the spouse's side. Then lone siblings with no parents in view are moved beside their brothers and sisters. This order is only a starting point (it can split runs: in-laws are aimed at positions, one at a time).
3b. Order first, positions after. Each row is split into blocks from who is whose child (union of a family's children with the families they marry into), so a split run is joined up again. From each of the widest rows (`SEEDS`), the rows above are sorted from the row below (ancestors over their descendants) and the rows below from the row above, then whole sweeps down and up (`SWEEPS`), keeping the best order seen (it may get worse on the way). Then small changes kept while they help (`ROUNDS`): neighbouring blocks swapped, neighbouring brothers and sisters swapped, a block mirrored, a unit turned round, and a couple turned round with its block mirrored and every other row re-sorted from it (which moves a whole ancestry to the other side). `now()` scores an order without positions: the couple rules broken (`pairRule`), then crossings plus `REACH` × rough line length plus `SOFT` × the preferences (age order, partners' usual order). Each part is kept per row, per pair of rows, per line or per couple, and `refresh()` works out again only what touches the rows (`dirty`) and units (moved, turned round) that changed; crossings are counted by sorting (`inversions`). Any change to the scoring must keep this bookkeeping right: a part that reads a new row or unit needs it in `unitReach`/`unitPairs`. The rounds stop at a work budget (`WORK`, counted as units, lines and couples scored, never timed, so a layout is the same on every machine); couples turned round (the costly move: every row re-sorted) stop at half of it.
   x positions come from `sweepX`: repeated passes pulling children under parents and parents over children, keeping each row's order and gaps (weighted isotonic regression, `isotonic()`); brothers and sisters are tied together (packed), so one pulled away by their own family takes the others with them instead of spreading the run. A last pass puts children with no children of their own back under their parents.
4. Read off positions and shift so the focus person (or the leftmost card) is at 0.

`layoutPositions` keeps the last `RECENT` groups' layouts by everything `layoutComponent` reads (`groupKeys`: each family touching the group, each person's birth year and sex, the view's settings). If the layout starts reading anything else from the data, add it to the key, or edits to it will show a stale layout.

The whole sweep drifts sideways a little on each pass (harmless, since step 4 shifts it back). Anything that aims at a neighbour's *current* x has to allow for that (see `place()` in `sweepX`).

## Working on it
- Run `npx vitest run src/lib/layout` after any change. `tree.test.ts` checks the Smith sample and the Darwin demo in several modes (everyone, focus views, vertical, horizontal, photos) against `checkLayout`, plus small hand-built cases for each rule. Add a hand-built case for every bug fixed.
- Real trees find the bugs. The owner's exports go in `scratch/` (gitignored and private: never commit them, or names from them). To reproduce a bug: a throwaway test under `src/lib/layout/__scratch/` that reads the file, runs `layoutTree`, and prints rows and `checkLayout`. Then shrink it to a minimal anonymous case (drop people one at a time while the bug persists) for the real test. Delete `__scratch/` before committing.
- To compare before and after, `git stash push src/lib/layout/positions.ts` and run the test again.
- Speed matters (it runs on every edit): the demo's full tree takes about 30 ms, the owner's largest tree about 60 ms, a 1,000-person test tree about 0.3 s, 2,000 about 0.65 s. Keep searches bounded, and count work rather than time it. Above 300 people in view TreeView runs the layout in the worker.
- Don't run Prettier on these files (the project isn't formatted with it, so it rewrites the whole file).

## Open issues
- Someone with two families where no partner is named in either: both children's lines leave from under their card and run together (`check.ts` flags it).
- Where two large branches meet through a single marriage, a long line and a wide empty band can remain between them (each branch settles over its own people). Closing it would mean sliding a whole branch away from its ancestors.
- A family's line can hop on its way to its nearest child where the row is crowded (the demo's Erasmus Darwin, whose children by three partners can't all sit under him). A preference, not a checked rule.
- The order search is local: a better order needing several rows changed at once is only found through the moves above (a couple turned round with its rows re-sorted).
