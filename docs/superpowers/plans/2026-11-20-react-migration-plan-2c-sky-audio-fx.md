# React Migration — Plan 2c: Sky View, Ambient Music, Background Starfield

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the three remaining imperative parts of legacy:
- the interactive sky map (`/bau-troi`, the last `<ComingSoon/>`);
- ambient music;
- the full-viewport background (`#bgAura` + `#bgStars` starfield / real sky, cursor sparks, meteors, `window.tarotBurst`).

After this plan every legacy feature runs in React.

**Architecture:**
- Pure astronomy maths go to `src/core/astro.ts`. That covers the Schlyter planet positions and **one** sky projection; legacy implemented the projection twice (inventory §4.1).
- Each canvas/audio piece is an engine in `src/engines/` with `start/stop` (spec §5.3). React components mount them with refs and feed them store prefs.
- Every listener, rAF loop and timer is torn down. This fixes the legacy leaks in inventory §4.1, §4.2 and §4.6.

**Spec:** `docs/superpowers/specs/2026-11-19-react-migration-design.md` (§2 "lose signature animation = failure", §5.3 engines).
**Inputs:** legacy inventory §1.8, §4.1, §4.2, §4.6, §4.10. Legacy file `tests/legacy/witches_tarot.legacy.html`.

## Global Constraints

- All Plan 1/2a/2b constraints still apply:
  - branch `react-migration`; never push; legacy frozen;
  - verbatim legacy CSS, with no new rules in `src/styles/`;
  - legacy ids and classes;
  - i18n through `useT` (`t` / `pick`);
  - gated commits (`npm run check > .superpowers/check.log 2>&1 && git commit`).
- **Storage keys and formats unchanged:** `tarotSkyLoc`, `tarotSkyLayers`, `tarotAmbientMode`, `tarotAmbient` (read-only migration, already in store), `tarotAmbientVol`, `tarotFx`, `tarotSkyMode`, `tarotSkyCity`.
- **Background behaviour:**
  - The background reads `html[data-fx|data-sky|data-skycity]` and `--star/--spark`, which `src/app/rootAttrs.ts` already sets.
  - With fx off, the canvas is cleared and **the rAF loop stops**, and it restarts when fx is turned back on. Legacy kept looping, so this is a ruling.
  - The loop also pauses while `document.hidden`.
- **Reduced motion:** same as legacy. No cursor sparks or meteors, static stars where legacy is static, and the sky view still works.
- **Audio:**
  - Ambient music uses the shared AudioContext from `src/engines/audio.ts` (`ensureAudio`/`getAudioCtx`, `makeReverb`). It never creates a second context.
  - Autostart waits for the first pointerdown or keydown, as legacy L2375 does.
- **Legacy bug fix (ruling):** the background real-sky mode reads `sky.json` `lines` as `[abbr, poly]` (inventory §4.1 bug), so constellation lines now draw.

## Review Focus

1. **Route changes.** Leaving `/bau-troi` stops its rAF and removes window/canvas/fullscreen listeners. Returning restarts it. *(Task 3)*
2. **fx and sky mode.** Toggling fx off/on and switching sky deco↔real↔city takes effect at once, with no second rAF loop. *(Task 2)*
3. **Ambient mode changes.** Switching off→mystic→candle→off quickly leaves no oscillators, timers or scheduler loops running. *(Task 4)*
4. **`sky.json` fails to load** (404/offline). The sky view shows the legacy fallback text and the background falls back to deco, with no uncaught error. *(Tasks 2, 3)*
5. **Geolocation.** Denied or unavailable GPS shows the legacy status text and keeps the previous location. *(Task 3)*

---

## File Structure

```
src/core/astro.ts            julianDay, gmst/lst, eclToEq, celestialBodies(jd) (L5026–5090), project(ra,dec,lat,lst) → {alt,az} | null
src/services/skyData.ts      loadSky(): Promise<SkyData> — one shared fetch of /sky.json (cached promise, retry after failure)
src/engines/starfield.ts     startStarfield(canvas, opts) → { update(opts), burst(x,y,n), stop() }   (L5718–5892)
src/components/Background.tsx  #bgAura + <canvas id="bgStars"> in Root; owns the starfield engine; sets window.tarotBurst
src/engines/skyMap.ts        startSkyMap(canvas, opts, cb) → { set(partial), reset(), zoom(f), pick, stop() } (L5124–5325)
src/features/sky/Sky.tsx     #skyView markup L1126–1152 + controls; mounts skyMap
src/engines/ambient.ts       startAmbient(mode, vol) → { setVolume(v), stop() }   (L2252–2378)
src/components/AmbientMusic.tsx  null-render component in Root: follows prefs.ambientMode/ambientVol, first-gesture kick
```

---

### Task 1: Astronomy core + sky data loader

**Files:** create `src/core/astro.ts`, `src/services/skyData.ts`, with tests.

**Interfaces:**
```ts
export interface Body { name: string; ra: number; dec: number; kind: 'sun' | 'moon' | 'planet'; color: string; size: number; illum?: number; waxing?: boolean }
export function julianDay(d: Date): number;
export function celestialBodies(jd: number): Body[];                       // byte-for-byte numbers as legacy
export function localSiderealDeg(jd: number, lonDeg: number): number;
export function altAz(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): { alt: number; az: number };
export interface SkyData { stars: [number, number, number][]; lines: [string, [number, number][]][]; names: [number, number, string][]; consts: [number, number, string, string][] }
export function loadSky(f?: typeof fetch): Promise<SkyData>;
```

- [ ] **Step 1: Write the failing tests.**
  - `celestialBodies(jd)` deep-equals legacy `celestialBodies` at 3 dates (harness).
  - `altAz` / `localSiderealDeg` reproduce the legacy sky-view projection (`skyvCompute` L5146) for 5 stars at a fixed date and location. Extract the numbers from the legacy code through the harness, or recompute the legacy formula inline in the test.
  - `loadSky`: a single in-flight fetch is shared. A failure rejects, and the next call retries.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit `feat(core): astronomy (Schlyter bodies, one sky projection) and sky.json loader`.

### Task 2: Background starfield / real sky + `tarotBurst`

**Files:** create `src/engines/starfield.ts`, `src/components/Background.tsx` and tests. Modify `src/app/routes.tsx` (mount `<Background/>` in Root, before the routes) and `src/engines/burst.ts` (keep using `window.tarotBurst`).

**Port:** L5718–5892 and the `#bgAura` markup. Check the legacy `<body>` start, around L830–836, for where `#bgAura` and `#bgStars` sit.
- **Modes:**
  - `deco`: ≤120 twinkling falling stars.
  - `real`: projected sky with `R = 0.62·max(W,H)`, recomputed every 30 s; lines, labels, bodies, and the VI compass letters B/N/Đ/T.
- **Sparks and meteors:** cursor sparks (max 36) and meteors (every 2.5–7.5 s), both off under reduced motion.
- **Colours:** `--star/--spark` are read on theme change. Watch `html[data-theme]` with a MutationObserver, or subscribe to `prefs.theme`; do not use the legacy `themechange` event.
- **Teardown:**
  - Unmount removes every listener (resize, mousemove) and cancels the rAF.
  - fx off stops the loop (Global Constraints).
  - `document.hidden` pauses the loop.

- [ ] **Step 1: Write the failing tests** (jsdom; stub the canvas 2D context; stub rAF):
  - mounting creates `#bgAura` and `canvas#bgStars`;
  - `window.tarotBurst` is a function while mounted and removed on unmount;
  - toggling fx off cancels the rAF (no frame after advancing), and toggling it back on resumes with exactly one loop;
  - `skyMode='real'` calls `loadSky` once. On rejection it falls back to deco with no unhandled rejection;
  - `lines` items `[abbr, poly]` produce segments (the bug fix);
  - unmount leaves no window listeners (spy add/remove by handler) and no timers.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit `feat(fx): background starfield / real sky with sparks, meteors and tarotBurst — paused when hidden or fx off`.

### Task 3: Sky view (`/bau-troi`)

**Files:** create `src/engines/skyMap.ts`, `src/features/sky/Sky.tsx` and tests. Modify `routes.tsx` (`sky: <Sky/>`); delete `ComingSoon` if nothing else uses it.

**Port:** markup L1126–1152 and engine L5124–5325, using Task 1's projection (no second copy).
- **Location `#skyLoc`:**
  - Choices `hcm`/`hanoi`/`danang`/`cantho`/`gps`, saved to `tarotSkyLoc`.
  - GPS uses `navigator.geolocation` and shows the legacy status texts.
- **Layer toggles:** `tarotSkyLayers` keeps the legacy JSON shape `{lines, grid, bodies, starsOnly}`.
- **Gestures:**
  - drag rotates (0.006 rad/px);
  - pinch zooms, clamped to 0.6–2.6;
  - the wheel zooms ×1.1 / ×0.9 (non-passive);
  - a tap with < 6 px movement picks the nearest star or body within 20 px, plus the constellation highlight, and shows the info box;
  - zoom buttons ×/÷1.2; reset sets rotation 0, zoom 1, no selection.
- **Fullscreen:** `#skyFull` uses the Fullscreen API on `.sky-stage`, with a webkit fallback.
- **`#skyInfo`:** legacy `updateSkyInfo` texts (VI/EN).
- **Lifecycle:** the engine starts on mount and stops on unmount, removing all listeners.

- [ ] **Step 1: Write the failing tests:**
  - **Markup:** the ids, classes and texts in order match legacy.
  - **Persistence:** changing `#skyLoc` to `danang` saves `tarotSkyLoc` and updates `#skyInfo`. The layer toggles flip `.on` and save the legacy JSON.
  - **Geolocation** (stubbed): success sets the location and saves `gps`. An error shows the legacy text and keeps the previous location (Review Focus 5).
  - **Fallback:** when `loadSky` rejects, `#skyInfo` shows the legacy fallback/error text (Review Focus 4).
  - **Gestures:** the zoom buttons clamp at 0.6 and 2.6. Reset restores rotation 0 and zoom 1.
  - **Teardown:** unmount removes the window resize and fullscreenchange listeners and cancels the rAF (Review Focus 1).
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit `feat(sky): interactive sky map with location, layers, gestures and fullscreen`.

### Task 4: Ambient music

**Files:** create `src/engines/ambient.ts`, `src/components/AmbientMusic.tsx` and tests. Modify `routes.tsx` (mount in Root).

**Port:** L2252–2378.
- **Graph:** master → compressor → makeup gain ×2 → destination, with a 1.5 s fade-in.
- **`mystic` mode:**
  - generative kalimba over Dm7–Bbmaj7–Gm7–C at BPM 66, with 4 rhythm patterns and occasional bells;
  - lowpass at 2600 Hz plus a reverb send through `makeReverb` from `audio.ts`;
  - a lookahead scheduler running every 250 ms, scheduling about 1.2 s ahead.
- **`candle` mode:** 68 Hz bed through a lowpass at 300 Hz, plus band-passed noise crackles every 55–475 ms.
- **`stop()`:**
  - clears every timer;
  - fades the master gain (0.4 time constant);
  - stops and disconnects the nodes after 1200 ms. That stop timer is also tracked, so a quick restart can't leak.
- **`AmbientMusic`:**
  - starts or stops on `prefs.ambientMode` and sets the volume on `prefs.ambientVol`;
  - if the mode is not `off` at load, it waits for the first pointerdown or keydown (listeners removed afterwards and on unmount).

- [ ] **Step 1: Write the failing tests** with a fake AudioContext that records created nodes and `start`/`stop` calls:
  - `mystic` start schedules notes ahead; `stop` stops every oscillator after 1200 ms and leaves 0 timers;
  - off→mystic→candle→off in quick succession leaves no running scheduler and every created source stopped (Review Focus 3);
  - the volume change applies to the master gain;
  - the first-gesture kick starts once and removes both listeners.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit `feat(audio): ambient music (mystic kalimba / candle) on the shared AudioContext`.

### Task 5: Parity, smoke, review

- [ ] **Step 1:** Run `scripts/parity-screens.mjs`.
  - The sky view and background are animated and live, so screenshot the sky view only for the controls region. Mask the canvas, or compare the `.panel` minus `.sky-stage`.
  - Extend the smoke script:
    - `/bau-troi` renders a non-blank canvas;
    - a tap shows info;
    - switching to `real` sky mode draws the background with no errors;
    - ambient on/off throws no errors.
  - Run both and record the results in `docs/superpowers/plans/plan-2c-parity.md`.
- [ ] **Step 2:** Whole-branch review (opus) of Plan 2c, then one fix wave, then a scoped re-review.
- [ ] **Step 3:** Update the ledger and memory.
