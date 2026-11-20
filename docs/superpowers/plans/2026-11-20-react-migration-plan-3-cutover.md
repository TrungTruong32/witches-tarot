# React Migration — Plan 3: PWA, CSP, Deploy Pipeline, Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the React build the thing that ships:
- offline-capable PWA that migrates installed users off the legacy cache;
- strict CSP without `'unsafe-inline'` scripts;
- `vercel.json` with SPA fallback that does not swallow `/api`, `/la-bai`, sitemap/robots;
- a local prebuilt deploy pipeline;
- retirement of `witches_tarot.html`.

Every step up to the merge is local. The push, the Preview deploy and the Production deploy each wait for the owner's explicit go.

**Architecture:**
- `vite build` produces `dist/`.
- `scripts/copy-static.mjs` copies the git-ignored card data and the static SEO files into `dist/`.
- A small Vite plugin generates `dist/sw.js` from `src/sw/sw.ts`. It injects the build's hashed asset list and a content-derived cache version.
- Vercel builds locally (`vercel build --prod`, `buildCommand`/`outputDirectory` in `vercel.json`), then deploys with `vercel deploy --prebuilt`. This follows spec §5.6: build on the machine, copy the git-ignored data, deploy prebuilt.

**Spec:** `docs/superpowers/specs/2026-11-19-react-migration-design.md`: §2 failure modes, §3 contract, §5.4 phase 3, §5.5 checklist, §5.6, §5.7.

## Global Constraints

- **Deploy and push:**
  - Deploy only from this machine. Never connect the GitHub repo to Vercel.
  - `deploy-prod.mjs` keeps refusing dirty trees and non-`main` branches.
  - **Never** push or deploy without the owner's go for that step.
- **Card data stays out of git:** `tarot.db`, `card_en.json`, `la-bai/`, `Data/*`. If anything moves, update `.gitignore` **and** `.vercelignore`.
- **API stays unchanged:** `api/` behaviour and its security invariants (`cleanMessages`, server-side system prompt, deck allowlist, `/api/img` as GET).
- **PWA:**
  - The new service worker deletes every `wtarot-v*` cache.
  - Navigations are network-first, with the app shell served offline for every app route.
  - `/la-bai/*` pages are cached under their own URL, as legacy does.
  - Data files (`tarot.db`, `card_en.json`, `sky.json`, card backs, icons) are cache-first under a cache name that changes whenever any of them changes. That name is a content hash, so the "bump CACHE" rule becomes automatic.
- **CSP:**
  - `script-src` has no `'unsafe-inline'` and no CDN host.
  - The inline theme bootstrap script is allowed by its sha256 hash, which is computed at build time and verified by a test.
  - `'wasm-unsafe-eval'` stays (sql.js).
  - `style-src 'unsafe-inline'` stays, because React `style` attributes need it. The spec only requires `script-src` to be clean.
- **Permissions-Policy:** `geolocation=(self)`. Legacy shipped `geolocation=()`, which silently broke the sky map's GPS button. This is a ruling.

## Review Focus

1. **An installed legacy PWA updates.** The old SW (`wtarot-v9`) is replaced, its caches are deleted, and the app still opens offline afterwards. *(Task 2)*
2. **Deep links under the SPA fallback:**
   - `/trai-bai#r=…`, `/nhat-ky` and the other app routes all serve the app;
   - `/la-bai/...`, `/sitemap.xml`, `/robots.txt`, `/google*.html` and `/api/*` are untouched;
   - unknown paths still 404, or go to the app's own redirect to `/`. *(Task 3)*
3. **CSP violations at runtime.** The production build must run with the real CSP and log zero violations, including sql.js wasm, fonts, speed insights, `/api/img` share images and `blob:` downloads. *(Task 4)*
4. **Old-browser and offline data.** A first offline visit after install still opens Browse and Draw from cached `tarot.db`. *(Task 2)*
5. **Deploy check.** The post-deploy check no longer looks for the `cloudSaveReading` string (it disappears when bundled). It checks a version meta tag instead. *(Task 5)*

---

### Task 1: Build output carries the data

- Create `scripts/copy-static.mjs`. After `vite build`, it copies into `dist/`:
  - every `ROOT_STATIC` file that exists (`scripts/root-static.mjs`);
  - `la-bai/`, `sitemap.xml`, `robots.txt`, `google*.html`.
- It exits non-zero if `tarot.db` is missing, so a build cannot ship without data.
- `package.json`: `"build": "tsc -b && vite build && node scripts/copy-static.mjs"`.
- Test (`tests/repo/copy-static.test.ts`):
  - with a temp root and a temp `dist`, the allowlisted files and `la-bai` are copied;
  - `.env`, `test.ipynb` and `Data/` are never copied;
  - a missing `tarot.db` fails.
- Add `<meta name="app-version" content="%APP_VERSION%">` to `index.html`. It is filled from the git short hash plus the build time through Vite `transformIndexHtml`.
- Commit: `build: dist carries card data and SEO files; version meta`.

### Task 2: Service worker

- Write `src/sw/sw.ts`, a port of the legacy `sw.js` behaviour:
  - network-first navigations, with app routes falling back to the cached `/index.html` when offline;
  - `/la-bai/*` cached under its own URL;
  - cache-first for the rest;
  - `/api/*` bypassed.
- The precache list is injected at build time (`self.__ASSETS`):
  - `/`, `/index.html`;
  - the hashed `/assets/*`, including the sql wasm;
  - data files, manifest, icons and card backs.
- `self.__VERSION` is a hash of the asset names plus the data-file contents. `activate` deletes every cache that isn't the current one, **including the legacy `wtarot-v*`**.
- Write `scripts/vite-sw-plugin.ts` (or inline it in `vite.config.ts`), which compiles `src/sw/sw.ts` to `dist/sw.js` with the injected values. The plugin hashes data files from the repo root.
- `main.tsx` registers `/sw.js` in production only, after `load`, as legacy does.
- Delete the root `sw.js` once the build emits one, so the root no longer serves the legacy SW in dev.
- Tests:
  - the routing decision function (pure: `route(req) → 'network-first-app' | 'network-first-page' | 'cache-first' | 'bypass'`) for each URL class;
  - the version changes when `tarot.db` bytes change;
  - `activate` deletes `wtarot-v9`, tested with a fake `caches`.
- Commit: `feat(pwa): generated service worker — precache build assets + data, content-hashed version, removes legacy caches`.

### Task 3: `vercel.json`

- `buildCommand: "npm run build"`, `outputDirectory: "dist"`, `framework: null`.
- Rewrites for the explicit app routes → `/index.html`: `/hom-nay`, `/tra-cuu`, `/boc-bai`, `/trai-bai`, `/nhat-ky`, `/yes-no`, `/bau-troi`.
  - Use an explicit list, not a catch-all, so `/la-bai`, `/api`, sitemap and robots can never be swallowed.
- Keep the redirect `/witches_tarot.html → /`.
- Headers: the existing security headers plus the new CSP (Task 4).
- Cache control: `/assets/*` `public, max-age=31536000, immutable`; `/sw.js` `no-cache`.
- Test (`tests/repo/vercel-config.test.ts`) parses `vercel.json` and asserts:
  - each app route rewrites to `/index.html`;
  - no rewrite source matches `/api/x`, `/la-bai/x`, `/sitemap.xml`, `/robots.txt`;
  - the `/api` CSP is unchanged;
  - `/sw.js` is not cached immutable.
- Commit: `deploy: vercel.json for the Vite build — explicit SPA routes, immutable assets`.

### Task 4: CSP without inline scripts

- Script hash: compute the sha256 of the inline theme script in `index.html` at test time and assert it appears in the `vercel.json` CSP `script-src`. The test fails if either one changes without the other.
- New CSP:
  - `script-src 'self' 'wasm-unsafe-eval' 'sha256-…'`;
  - remove `'unsafe-inline'` and `https://cdnjs.cloudflare.com` from `script-src`;
  - keep the rest unless the build shows it is no longer needed.
- `Permissions-Policy`: `geolocation=(self)`.
- Verify:
  - serve `dist/` locally with the real headers from `vercel.json` (a small test server that applies the header and rewrite rules);
  - run `scripts/smoke-flows.mjs` against it with a `securitypolicyviolation` listener;
  - zero violations.
- Commit: `security: CSP without unsafe-inline scripts (theme bootstrap by hash); geolocation allowed for the sky map`.

### Task 5: Deploy pipeline + preview script

`scripts/deploy-prod.mjs`:
- Run `npm run check` first.
- Then `vercel build --prod`, followed by `vercel deploy --prebuilt --prod`.
- Post-deploy checks:
  - `/` serves `meta[name=app-version]` equal to the local build's version;
  - `/trai-bai` returns 200 with the app;
  - `/la-bai/` returns 200;
  - `/api/readings` and `/api/ai` keep their existing checks.

`scripts/deploy-preview.mjs`:
- Same pipeline without `--prod`.
- Prints the preview URL.
- Then runs `smoke-flows.mjs` against it. The smoke script takes `BASE` from argv; when `BASE` is given, it skips the Vite dev server.

Tests: deploy-guard tests stay. Add a unit test for the version-meta check helper.

Commit: `deploy: local prebuilt Vercel deploys (preview + prod) with version check and smoke`.

### Task 6: Cutover on the branch

- `git rm witches_tarot.html` (spec §5.4: delete after cutover).
  - `tests/legacy/witches_tarot.legacy.html` stays as the frozen parity reference.
  - Point `scripts/parity-screens.mjs` and `root-static.mjs` `serveLegacy` at the frozen copy.
- `.vercelignore`: do not upload `src`, `tests`, `dist`, `node_modules`, `docs`, `scripts`. With a prebuilt deploy only `.vercel/output` is uploaded; check what `--prebuilt` actually reads.
- Update `README.md` / `README.en.md`: stack, structure, scripts (dev/build/check/smoke/parity), and the architecture summary for interviewers.
- CI (`.github/workflows/ci.yml`): make sure it runs typecheck, lint and test. Build cannot run in CI, because the card data isn't in git.
- Run the full verification:
  - `npm run check`;
  - `npm run build`;
  - local `dist` smoke with real headers and offline (Task 4 server + Playwright `context.setOffline(true)` after the first visit);
  - parity screens.
- Commit: `chore: cut over to the React build — retire witches_tarot.html, README, CI`.

### Task 7: Review, then hand-off for the owner's go

- Run a whole-branch review of Plan 3, then one fix wave.
- **Stop and ask the owner**, with the checklist results, before each of:
  - (a) Preview deploy plus smoke on Preview;
  - (b) merge `react-migration` → `main` and a single `git push`;
  - (c) `node scripts/deploy-prod.mjs`.
