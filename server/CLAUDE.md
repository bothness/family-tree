# Shared family edition and deploying

Syncing, the server, sign-in and both deploys: `server/`, `functions/`, `src/lib/sync/`, `wrangler.toml`, `static-family/`, `scripts/family-head.mjs`, `.github/workflows/deploy.yml`, `svelte.config.js` (base path).

## Two editions, one codebase
- **Public edition**: browser-only, at https://bothness.github.io/family-tree/ (GitHub Pages; `BASE_PATH=/family-tree`, SPA fallback `404.html`, `.nojekyll`). Must keep working with no server.
- **Family edition**: https://mbfamilytree.pages.dev (Cloudflare Pages project `mbfamilytree`). The same build with `SYNC=cloudflare`, which sets `__SYNC__` so the sync code is loaded only there; `npm run build:family` also copies `static-family/` (privacy page, a robots.txt that blocks everything) and swaps the sharing tags for noindex (`family-head.mjs`).
- Features are shared. Only sync, sign-in and access differ, so keep edition checks to `__SYNC__` and `app.canEdit`.

## How sync works
- Everyone keeps a full copy in the browser and works offline. The server keeps numbered versions. `PUT /api/tree` sends `{ base, data }`; if someone saved first it gets a 409 with the newest, and the client merges and retries.
- `sync/merge.ts`: three-way merge (last synced, this device, newest), item by item by id. **Clashes are settled by rules, never by asking**: the newer edit wins (`meta.updatedAt`, set by `stampChanges`); deleted on one side and edited on the other is kept, with its links. Then repairs (no dangling references, one family per child, at most two partners).
- `sync/engine.ts` (`createSync`, `readOnly`), `sync/http.ts` (`httpRemote`, `account`), `sync/start.ts` (polls every 30 s), `sync/patch.ts` (applies incoming changes in place to the `$state` data, so nothing being edited is rebuilt). A device that has never synced takes the shared tree and keeps its own aside, never merged in.
- A small status only (saved / saving / offline); clashes are never shown.

## Server
- `functions/api/[[path]].ts` (the Pages Function) → `server/api.ts` (routes and roles; the route list is at the top of the file) → `server/repo.ts` (D1 holds the version list, which acts as the lock, plus users and sessions; R2 holds each version as a file, and photos). Old versions are thinned to the last 200 plus one a day. Migrations are in `server/migrations/` (applied by the workflow).
- Sign-in (our own code, no Cloudflare Access, so no per-user cost): `server/google.ts` checks Google's ID token (RS256 against Google's keys); `server/session.ts` keeps hashed session tokens in a `__Host-` cookie, `SameSite=Lax`. Roles are owner / editor / viewer, from the invite list in D1 (never in backups or the repo). The first owner comes from the `OWNER_EMAIL` setting. Viewers get read-only screens (`app.canEdit` false).
- Tests: `server/api.test.ts`, `server/google.test.ts`, `sync/*.test.ts` (including seeded random two-device runs of the merge).

## Running it locally
- `npm run dev:family` (http://localhost:8788) needs `.dev.vars` (copy `.dev.vars.example`). The owner's `.dev.vars` holds their real `OWNER_EMAIL` and `GOOGLE_CLIENT_ID`: don't overwrite it, and restore it if you swap it for a test.
- The owner may have their own `dev:family` running on 8788 with local data in `.wrangler/state`. Don't touch either. For tests, run wrangler on another port (8790) with `--persist-to` a folder in the session's scratch area.

## Deploying
- **Every push to `main` deploys both editions** (`deploy.yml`: `build` runs the tests and type check, then `deploy` goes to GitHub Pages and `family` to Cloudflare via wrangler, applying D1 migrations first). So a push is a release: run `npm test` and `npm run check` first, and be careful with migrations, since the family edition holds real data.
- Secrets: GitHub repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; Cloudflare Pages settings `OWNER_EMAIL` and `GOOGLE_CLIENT_ID`. Resources: D1 database `family-tree` (id in `wrangler.toml`), R2 bucket `family-tree`. Google OAuth's authorised domain is `mbfamilytree.pages.dev`; the privacy page is `/privacy`.

## Open issues
- None known.
