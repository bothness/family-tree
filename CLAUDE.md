# Family Tree Builder

A family tree app for one person and close family: sketch trees quickly from patchy information, mark how sure each fact is, and fill in researched detail later. Two editions from one codebase: a public browser-only one and a shared family one.

## Areas
Work usually happens in one area per conversation. Each area has a guide that loads when you work in its folder; read it first for anything non-trivial.

| Area | Code | Guide |
|---|---|---|
| Tree layout | `src/lib/layout/` | `src/lib/layout/CLAUDE.md` |
| Data, dates, places, exports | `src/lib/model/`, `export/`, `places/`, `media/`, `storage/`, `data/`, `schema/` | `src/lib/model/CLAUDE.md` (full model: `docs/MODEL.md`) |
| Interface | `src/lib/components/`, `src/routes/`, `src/app.css`, `app.svelte.ts` | `src/lib/components/CLAUDE.md` |
| Shared edition and deploying | `server/`, `functions/`, `src/lib/sync/`, `.github/` | `server/CLAUDE.md` |

- `docs/ROADMAP.md`: open work only, by area. `docs/DECISIONS.md`: why things are as they are, and finished phases. Search it when you need a reason; don't read it up front.
- `docs/prototype/family-tree-sketchbook.html` is the original prototype: a reference for intended behaviour, not code to edit.

## Commands
- `npm run dev` (dev server) · `npm test` (Vitest, `src/**/*.test.ts` and `server/`) · `npm run check` (svelte-check plus `tsc -p server`) · `npm run build` (static, to `build/`) · `npm run build:family` / `npm run dev:family` (family edition, see `server/CLAUDE.md`) · `npm run validate [file.json]`
- Run `npm test` and `npm run check` before finishing any change. **Every push to `main` deploys both editions**, so pushing is releasing.

## Conventions
- SvelteKit, Svelte 5 runes, TypeScript, Vite. Client-only SPA (`ssr = false`).
- Imports use subpath imports with explicit extensions: `#lib/model/queries.ts`, `./types.ts`.
- Logic in `model/` and `layout/` is plain TypeScript (no Svelte), takes the `Dataset` explicitly, and is tested with Vitest on small hand-built datasets. Components only render.
- The app must work fully with no server; sync is a layer on top of the browser store.
- Match the surrounding code: its comment density and naming. Don't run Prettier (the project isn't formatted with it).

## Product principles
- Sketching must stay quick. Extra detail is optional and tucked away.
- **Uncertainty is per fact** (confirmed / likely / guess; dates by their EDTF marks, `1858?`), shown as ink vs pencil and solid vs dashed lines. Gaps stay visible.
- Plain language in the UI ("Child of", "Someone already added"), not data-model terms.
- Derived data is never stored.

## Finishing a piece of work
1. `npm test` and `npm run check`.
2. Update the area's guide if how it works changed, and its "Open issues".
3. Add one line to `docs/DECISIONS.md` under the area, and remove or tick the item in `docs/ROADMAP.md`.
4. Commit, then push when the owner agrees (it deploys).
