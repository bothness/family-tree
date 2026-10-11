# Tree layout

Pure functions: a `Dataset` and the people in view go in, card positions and lines come out. Components only draw them. No Svelte here.

## Files
- `positions.ts`: where each card goes (step 1). `layoutPositions(d, branches, root?, size)`; card sizes (`cardSize`, `NODE_W`, `PORTRAIT_W`, …) and gaps (`CARD_GAP` between partners, `SIB_GAP` between siblings, `FAM_GAP` between families, `COMP_GAP` between unconnected groups).
- `connectors.ts`: the lines (step 2), from card positions alone, so `TreeView` can re-run it on in-between positions while animating: couple lines (raised when someone sits between partners), drops, buses at separate heights where they'd overlap, hops where lines cross, stubs nudged apart where a child's line would run along another family's.
- `tree.ts`: `layoutTree` combines the two. Horizontal trees are the vertical layout worked out with the card turned on its side (`turn`), then flipped (`flip`); `routeShown` re-routes lines for the cards on screen.
- `check.ts`: `checkLayout(d, L, ids)` lists every rule a layout breaks (empty = good); `crossings()` counts crossing lines. Tests use it; it's the definition of "correct".
- `viewport.ts`: pan/zoom camera maths. `timeline.ts`, `map.ts`: the other tabs' layouts.

## Rules
In priority order where they compete. `check.ts` tests them.
- One row per generation. Centred; in a focus view the focus person is at x = 0, so the view grows around them.
- A couple sits side by side, father on the left. Exception: when both partners' parents are in view and placed the other way round, free-standing parents are moved, otherwise the couple swaps, so lines never cross.
- Someone with several partners sits between them, earlier partnerships on the left (three or more: the first half on the left), each partner's other partners further out. Partners with someone between them get a raised line, and their children's line drops just inside the outer partner.
- Siblings are grouped, in **strict age order, always** (unknown birth dates count as youngest). Each family's children hang under their own couple.
- When both partners' parents are in view, the spouse's siblings go beyond the other family's children (on their parents' side if those are already placed, else the spouse's side). When two families intermarry more than once, the spouse joins their partner within one family's run and their own parents' line reaches over (the demo's Josiah Wedgwood III beside Caroline Darwin).
- A partner's parents are placed above them.
- Brothers and sisters whose parents aren't in view stay side by side, in age order, like any other siblings.
- Families whose lines would overlap get separate heights; lines hop where they cross.
- Fewer crossings, without breaking the rules above: no family pulled away from its children, no couple with siblings on both sides.
- Nothing is ordered by when it was added: the layout is the same whatever order people and families are stored in.

## Method (`positions.ts`, numbered as in the code)
1. Generations: breadth-first from the focus person (else the earliest born); partners share a row, children go one row down.
2. Units: a person and their partners on one row, arranged by `arrange()`. Missing-children placeholders become units of their own.
3. Order within rows: walk down from the earliest roots. A group that joins only below (an in-law's family) is *deferred* and inserted once there are positions to aim at, its siblings on the spouse's side. Then lone siblings with no parents in view are moved beside their brothers and sisters, and `uncross()` fixes couples whose parents are the wrong way round. x positions come from `sweepX`: repeated passes pulling children under parents and parents over children, keeping each row's order and gaps (weighted isotonic regression, `isotonic()`).
3b. Crossing reduction: rows are split into blocks that must stay whole (a family's children, a spouse with their in-laws, parentless siblings), reordered by their relatives' positions in sweeps down and up, then neighbouring blocks are swapped under a work budget. A change is kept only if `score()` is strictly better: rules first (strays, mixed), then crossings (a person's own families crossing counts double), then line length.
4. Read off positions and shift so the focus person (or the leftmost card) is at 0.

The whole sweep drifts sideways a little on each pass (harmless, since step 4 shifts it back). Anything that aims at a neighbour's *current* x has to allow for that (see `place()` in `sweepX`).

## Working on it
- Run `npx vitest run src/lib/layout` after any change. `tree.test.ts` checks the Smith sample and the Darwin demo in several modes (everyone, focus views, vertical, horizontal, photos) against `checkLayout`, plus small hand-built cases for each rule. Add a hand-built case for every bug fixed.
- Real trees find the bugs. The owner's exports go in `scratch/` (gitignored and private: never commit them, or names from them). To reproduce a bug: a throwaway test under `src/lib/layout/__scratch/` that reads the file, runs `layoutTree`, and prints rows and `checkLayout`. Then shrink it to a minimal anonymous case (drop people one at a time while the bug persists) for the real test. Delete `__scratch/` before committing.
- To compare before and after, `git stash push src/lib/layout/positions.ts` and run the test again.
- Speed matters (it runs on every edit): the demo's full tree takes about 60–120 ms. Keep searches bounded.
- Don't run Prettier on these files (the project isn't formatted with it, so it rewrites the whole file).

## Open issues
- Someone with two families where no partner is named in either: both children's lines leave from under their card and run together (`check.ts` flags it).
