# React Migration — Plan 2a: App Shell, Landing, Browse, Daily, Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a running React app that looks and behaves like the legacy app for the app shell (boot, routing, i18n, themes, nav drawer/dome), Landing, Browse, Daily, and both settings overlays. Draw/Reading/History/Yes-No are Plan 2b; Sky, audio and background effects are Plan 2c.

**Architecture:** The DOM keeps the legacy ids and classes, and the legacy CSS is copied **verbatim** (split per section, byte-parity tested), so visual parity comes for free. App state lives in one Zustand store whose persisted fields go through `services/storage` (legacy keys). Each screen is a route. Pure helpers that are still inside the legacy UI code (smart search, moon phase, card-back SVGs, daily pick, suit meta) are ported first, with the same legacy-parity harness as Plan 1.

**Tech Stack:** Vite, React 18, TS strict, Zustand 5, react-router 6 (`createBrowserRouter`), Vitest + @testing-library/react + user-event.

**Spec:** `docs/superpowers/specs/2026-11-19-react-migration-design.md` (note the 2026-11-19 CSS amendment in §5.1)
**Inputs:** Plan 1 interfaces (`src/core/*`, `src/services/*`). Legacy UI inventory: `docs/superpowers/research/legacy-ui-inventory.md`. Line numbers below refer to `witches_tarot.html` (== `tests/legacy/witches_tarot.legacy.html`).

## Global Constraints

- Everything from Plan 1's Global Constraints still applies: branch `react-migration`, never push, legacy files frozen, no real card data in fixtures, and the storage/IDB/share contract.
- **Visual parity.** The JSX for each screen reproduces the legacy markup for that screen (same element types, ids, classes, `data-*` and `aria-*` attributes, text). The lines to port are named in each task. Do not restyle anything.
- **CSS.** `src/styles/*.css` concatenated in the order of `src/styles/index.ts` must equal legacy lines 47–827 byte-for-byte (the content between `<style>` and `</style>`). Nothing else styles the app in this plan.
- **Routes.** `/` landing · `/hom-nay` daily · `/tra-cuu` browse · `/boc-bai` draw · `/trai-bai` reading · `/nhat-ky` history · `/yes-no` yes/no · `/bau-troi` sky. Unbuilt screens render `<ComingSoon/>` (dev only). `body[data-mode]` = legacy mode name (`daily|browse|draw|reading|history|yesno|sky`).
- **i18n.** No UI string is hard-coded twice. Dictionary keys come from the legacy `data-i18n` / `T_IDS` / `T_PH` / `I18N.en`. Inline legacy ternaries become `pick({ vi, en })` with the exact legacy texts.
- **Effects.** Every listener, interval, rAF and timeout created in an effect is cleaned up on unmount. This fixes the leaks listed in inventory §10.
- **Accessibility.** Overlays (drawer, settings, site settings, lightbox) close on Esc and return focus to the element that opened them. This is a deliberate improvement, so record it as a ruling, not as drift.

## Review Focus

1. **Language switch while on Browse.** Suit tiles, card details and placeholders must re-render in the new language. (Legacy left the suit tiles stale, so this is a fix and gets a ledger ruling.) *Pinned in Task 7.*
2. **DB load failure.** `/tarot.db` returns 404. The app must show the legacy boot error text in `#bootStatus`, and the landing CTAs must not spin forever: show the error and stay on landing. *Pinned in Task 3.*
3. **Stored values from older versions.** `cardBack` = `moon|night|plain` (legacy aliases), an unknown theme, `tarotLang='fr'`. Each must fall back exactly like legacy. *Pinned in Tasks 3 and 9.*
4. **Deep link `/#r=...` on first load.** The landing must hand off to `/trai-bai` with the hash preserved (Plan 2b renders it), and must not show the landing first. *Pinned in Task 5.*
5. **Unmount mid-animation.** Navigating away from Landing while the tip rotation interval and fan resize debounce are pending must leave no timers running. *Pinned in Task 6.*

---

## File Structure

```
index.html                      + inline theme bootstrap (verbatim legacy L833) and the legacy <head> meta needed for fonts
src/main.tsx                    router + store boot
src/app/
  store.ts                      Zustand store (prefs, lang, deck, db status, overlays)
  boot.ts                       loadCardsDb + deck restore + share-hash detection
  rootAttrs.ts                  syncs html[data-theme|data-fx|data-sky|data-skycity|lang], --cardback, body[data-mode]
  routes.tsx                    route table + MODE ↔ path map
  AppLayout.tsx                 #appPage shell: header, nav, #deckBar, #bootStatus, <Outlet/>, overlays
src/i18n/
  vi.ts en.ts                   dictionaries (generated once by scripts/extract-i18n.mjs, then committed)
  useT.ts                       useT() → { t(key), pick({vi,en}), lang }
src/components/
  IconSprite.tsx Icon.tsx Logo.tsx   verbatim SVG sprite (L832) and logo; <Icon name> → <svg class="ico"><use href="#i-…"/></svg>
  NavMenu.tsx                   drawer + desktop dome (arc layout, auto-hide, install button)
  Lightbox.tsx DeckSelect.tsx CorrChips.tsx Overlay.tsx (Esc + focus return)
src/features/
  landing/Landing.tsx landing/fan.ts
  browse/Browse.tsx browse/SuitTiles.tsx browse/CardDetails.tsx
  daily/Daily.tsx
  settings/AiSettings.tsx settings/SiteSettings.tsx
  ComingSoon.tsx
src/core/
  search.ts                     smart card search (legacy L2804–2916)
  moon.ts                       moonPhase, moonSvg (L4967–5020)
  cardBacks.ts                  CB generator + names + aliases (L5531–5676), verbatim
  daily.ts                      dailyKey, hashStr, pickDailyCard (L2474–2476)
  suits.ts                      SUIT_META (L1813), seoCardPath (L1751)
src/services/ai/models.ts       list/test models per provider (L3141–3363)
src/styles/*.css + index.ts     verbatim legacy CSS split by section (inventory §6 boundaries)
scripts/extract-i18n.mjs        one-shot generator for vi.ts/en.ts from the legacy HTML
```

---

### Task 1: Port the remaining pure helpers (search, moon, card backs, daily, suits)

**Files:** Create `src/core/{search,moon,cardBacks,daily,suits}.ts` plus a `*.test.ts` for each.

**Interfaces (Produces):**
```ts
// search.ts
export function createCardSearch(cards: Card[]): (raw: string, limit?: number) => Card[];   // = legacy buildSearchIndex+searchCards for one deck
export function fold(t: string): string;
// moon.ts
export interface MoonPhase { age: number; frac: number; illum: number; name: string; nameEn: string; hint: string; hintEn: string } // fields exactly as legacy moonPhase returns (copy the names from L4968–4991)
export function moonPhase(date: Date): MoonPhase;
export function moonSvg(frac: number, cls: string, idSeq: () => number): string;   // legacy used a global counter; inject it
// cardBacks.ts
export const CARD_BACK_KEYS: readonly string[]; export function cardBackSvg(k: string): string; export function cardBackCss(k: string): string;
export const CARD_BACK_NAMES: Record<string, [string, string]>; export function normalizeCardBack(saved: string | null): string; // alias + unknown → 'zodiac'
// daily.ts
export function dailyKey(d?: Date): string; export function hashStr(s: string): number; export function pickDailyCard(cards: Card[], deck: string, d?: Date): Card | null;
// suits.ts
export const SUIT_META: Record<string, { vi: string; en: string; sym: string; el?: [string, string] }>; export function seoCardPath(card: Card): string | null;
```
Generate the large verbatim blocks (`CB`, the alias tables in search) with a one-off extraction like Plan 1 Task 5 did for spreads, not by retyping them.

- [ ] **Step 1: Write the failing parity tests** (harness from `tests/legacy/harness.ts`):
  - search: build a fixture DB with ~20 synthetic cards across both decks, and give the legacy code globals `{ db, selectedDeck }`. For each query in `['1','10','13','xiii','át chén','ace of cups','vua kiếm','king swords','hoàng hậu','tower','tòa tháp','devil','the','', 'zzz']` and limit ∈ {8, 78}, `createCardSearch(deckCards)(q, limit)` must equal legacy `searchCards(q, limit)`, comparing ids in order.
  - moon: for 40 dates spread across 2000–2030 (including the reference new moon), the result must deep-equal the legacy `moonPhase`. `moonSvg` must equal the legacy output for frac ∈ {0, .25, .5, .75, .99} with the same sequence number.
  - cardBacks: for every key, `cardBackSvg(k)` and `cardBackCss(k)` must equal legacy `CB.svg(k)` / `CB.css(k)`. `normalizeCardBack` must map `moon→triple`, `night→stars`, `plain→sacred`, `'bogus'→zodiac` and `null→zodiac`.
  - daily: `dailyKey(new Date(2026,0,5))==='2026-1-5'` (not zero-padded). `pickDailyCard` must match the legacy `rows[hashStr(dailyKey()+'|'+deck) % n]` for 3 dates × 2 decks.
  - suits: `SUIT_META` deep-equals the legacy value. `seoCardPath` matches the legacy output for one Witches card, one Rider-Waite card and one unknown-deck card.
- [ ] **Step 2:** Run `npx vitest run src/core`. Expect FAIL (missing modules).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run check`. Expect PASS.
- [ ] **Step 5:** Commit: `feat(core): smart search, moon phase, card backs, daily pick, suit meta (legacy-parity tested)`.

---

### Task 2: Verbatim CSS, icon sprite, logo, index.html head

**Files:** Create `src/styles/*.css`, `src/styles/index.ts`, `src/styles/styles.test.ts`, `src/components/{IconSprite,Icon,Logo}.tsx`. Modify `index.html`.

**Interfaces:** `src/styles/index.ts` imports the CSS files in order and exports `CSS_ORDER: string[]` (the file names). `<IconSprite/>` renders legacy L832 verbatim. `<Icon name="moon"/>` renders `<svg class="ico" aria-hidden="true"><use href="#i-moon"/></svg>`. `<Logo variant="L"|"H"/>` renders the inline logo SVG from L868 / L915, with its gradient id suffix.

- [ ] **Step 1: Write the failing test.** Read each file in `CSS_ORDER` from disk, join them with `''`, and assert the result equals the legacy text between `<style>` and `</style>` (lines 46–828). Use exact string equality.
- [ ] **Step 2:** Run the test and expect FAIL.
- [ ] **Step 3:** Split the legacy CSS at the inventory §6 boundaries into: `tokens.css` (47–82), `base.css` (83–132), `nav-drawer.css`, `landing.css`, `views.css`, `browse.css`, `reading.css`, `board.css`, `forms.css`, `spread-items.css`, `ai-output.css`, `background.css`, `cardback.css`, `moon.css`, `ritual.css`, `modals.css`, `history.css`, `ai-cards-bg.css`, `draw.css`, `chips.css`, `sky.css`, `yesno.css`, `site.css`, `flip.css`, `riffle.css`, `icons.css`, `nav-desktop.css`, `wheel.css`, `responsive.css`. Use a split script so no byte is retyped.
- [ ] **Step 4:** `index.html`:
  - Copy the legacy `<head>` items the app needs at runtime: charset, viewport, theme-color, Google Fonts links, manifest and icons.
  - Copy the L833 theme bootstrap `<script>` verbatim.
  - Leave the SEO meta and JSON-LD to Plan 3.
- [ ] **Step 5:** Run `npm run check`. Expect PASS.
- [ ] **Step 6:** Commit: `feat(ui): verbatim legacy CSS split by section, icon sprite, logo`.

---

### Task 3: Store, root attributes, boot

**Files:** Create `src/app/{store,rootAttrs,boot}.ts` plus tests.

**Interfaces:**
```ts
export interface Prefs { theme: '' | 'night' | 'rose' | 'light'; fx: 'on' | 'off'; skyMode: 'deco' | 'real'; skyCity: string; cardBack: string;
  ritualOff: boolean; soundOn: boolean; soundVol: number; ambientMode: 'off' | 'mystic' | 'candle'; ambientVol: number; cloudSave: boolean }
export interface AppState {
  lang: Lang; prefs: Prefs; deck: string | null; decks: string[]; db: CardsDb | null; dbStatus: 'loading' | 'ready' | 'error'; dbError: string;
  cardEn: CardEnMap | null; aiSettings: AiSettings;
  overlay: null | 'nav' | 'ai' | 'site'; lightbox: { url: string; reversed: boolean } | null;
  setLang(l: Lang): void; setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void; setDeck(d: string): void; saveAiSettings(s: AiSettings): void;
  openOverlay(o: AppState['overlay']): void; closeOverlay(): void; openLightbox(url: string, reversed: boolean): void; closeLightbox(): void;
}
export const useApp: UseBoundStore<StoreApi<AppState>>;
export function loadPrefs(): Prefs;        // legacy init semantics per key (L2255–2260 ambient migration from 'tarotAmbient', L4596 sound, L5104 ritual, L2382–2383 fx/sky, theme, cardBack via normalizeCardBack)
export function syncRootAttrs(s: AppState, mode: string | null): void;   // html[data-theme] (removed when ''), data-fx, data-sky, data-skycity, lang; --cardback; body[data-mode]
export function boot(load?: typeof loadCardsDb): Promise<void>;          // legacy L5500–5526 order; sets dbStatus; restores deck from witchesTarotDeck (fallback: first of decks()); clearOldDecks(); schedules cloudBackfill after 2500 ms; ensures card_en.json when lang==='en'
```
Each setter writes through to the legacy key, using the legacy value format: `'1'`/`'0'` for booleans, as the legacy code does for each key.

- [ ] **Step 1: Write the failing tests.**
  - `loadPrefs` must equal what the legacy init code yields for these stored values:
    - empty storage;
    - `tarotAmbient='1'` without `tarotAmbientMode` (migration → `mystic`);
    - `cardBack='night'`;
    - `theme='bogus'`;
    - `tarotRitual='0'`;
    - `tarotLang='fr'` (→ vi).
  - Setters persist to the legacy keys.
  - `syncRootAttrs` sets and removes the attributes exactly.
  - **Review Focus 2:** `boot` with a loader that rejects sets `dbStatus:'error'` and the legacy error text. With a fixture DB, `deck` is restored from `witchesTarotDeck` when valid and falls back otherwise. `setDeck` persists the deck.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS.
- [ ] **Step 5:** Commit: `feat(app): Zustand store with legacy-compatible persistence, root attribute sync, boot sequence`.

---

### Task 4: i18n dictionaries and `useT`

**Files:** Create `scripts/extract-i18n.mjs`, `src/i18n/{vi,en}.ts`, `src/i18n/useT.ts`, `src/i18n/i18n.test.ts`.

**Interfaces:** `type I18nKey = keyof typeof vi`. `useT(): { lang: Lang; t: (k: I18nKey) => string; pick: (p: { vi: string; en: string }) => string }`. `t` returns `en[k] ?? vi[k]` when lang is `en`, which mirrors the legacy `t(key, fb)`. `stripGlyph(text)` exported from `useT.ts` = the legacy `setLabel` glyph strip regex `/^[^\p{L}\p{N}"“(]+/u`, used when an `<Icon>` precedes the label.

- [ ] **Step 1:** Write `extract-i18n.mjs`. It parses the legacy HTML body (L830–1341) and collects the VI text of every `[data-i18n]` element, the placeholder of every `[data-i18n-ph]` element, and the elements listed in `T_IDS` / `T_PH`, keyed by their key. EN comes from the legacy `I18N.en` object (load it through the harness). Run it once and commit `vi.ts` and `en.ts`. Drop the 8 dead EN keys listed in inventory §5.3.
- [ ] **Step 2: Write the failing tests.**
  - Every `en` key exists in `vi`.
  - `vi['nav.home']` equals the legacy HTML text of `#goHome`.
  - With lang `en`, `t('nav.home')==='☉︎ Home'`.
  - `pick` returns the right side for each lang.
  - `stripGlyph('☉︎ Home')==='Home'` and `stripGlyph('"Quote"')==='"Quote"'`.
- [ ] **Step 3:** Run and expect FAIL. **Step 4:** Implement `useT` (reads `lang` via `useApp(s => s.lang)` from Task 3). **Step 5:** Run `npm run check` and expect PASS. **Step 6:** Commit: `feat(i18n): VI/EN dictionaries extracted from legacy markup + useT`.

---

### Task 5: Routing, app layout, nav, overlays shell, lightbox

**Files:** Create `src/app/{routes.tsx,AppLayout.tsx}`, `src/components/{NavMenu,Overlay,Lightbox,DeckSelect,CorrChips}.tsx`, `src/features/ComingSoon.tsx`. Modify `src/main.tsx`. Add tests.

**Interfaces:** `MODE_BY_PATH: Record<string, Mode>` and `PATH_BY_MODE`. `<AppLayout>` ports legacy L909–941 (nav toggle, scrim, `#appPage` header, `#navMenu`, `#deckBar`, `#bootStatus`) and renders `<Outlet/>` inside the view root with the legacy view id (`browseView`…) and the `.view-in` replay on route change. `<Overlay id open onClose labelledBy>` handles the `.open` class, backdrop click, Esc and focus return. `<NavMenu>` ports L921–934 plus `initNavDecor`/`layoutNavArc`/`navAutoHide`/the install prompt (L1905–1964, L2124–2133), with cleanup.

- [ ] **Step 0:** `npm i react-router-dom@6 && npm i -D @testing-library/user-event@14`.
- [ ] **Step 1: Write the failing tests (RTL + MemoryRouter).**
  - Clicking `#modeBrowse` navigates to `/tra-cuu`, sets `body[data-mode=browse]`, gives `#modeBrowse` `.active`, and closes the drawer.
  - `#navToggle` opens the drawer and Esc closes it, with focus back on `#navToggle`.
  - `#goHome` navigates to `/`.
  - **Review Focus 4:** an initial URL of `/#r=abc` redirects to `/trai-bai#r=abc` and never renders `#landing`.
  - Unmounting `NavMenu` removes its scroll, resize and mousemove listeners (spy on `window.removeEventListener`).
  - The lightbox opens from the store with the `reversed` rotation class, closes on click and on Esc.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS.
- [ ] **Step 5:** Commit: `feat(ui): routes, app layout, nav drawer/dome, overlays, lightbox`.

---

### Task 6: Landing

**Files:** Create `src/features/landing/{Landing.tsx,fan.ts}` plus tests.

**Interfaces:** `layoutFan(width: number): { n: number; cw: number; R: number; cards: { a: number; dl: number }[] }`, the pure part of legacy `layoutLandingFan` L2025. `<Landing>` ports markup L852–907 (including `.lt-seo` and the FAQ text verbatim) and the behaviour of `initLanding` L2019–2098 and `enterApp`/`goLanding` (L1968–1993). Ask submit navigates to `/trai-bai` with router state `{ question, autoPick: true }`. Plan 2b's reading screen consumes that state.

- [ ] **Step 1: Write the failing tests.**
  - `layoutFan` matches the legacy fan math for widths 320, 768 and 1440. Port the numeric part of legacy L2025–2049 into the harness comparison by extracting `layoutLandingFan`'s constants, or assert the legacy formulas directly if extraction needs the DOM.
  - An empty submit shows `#askErr` and adds `.shake`, and the error hides after 2600 ms (fake timers).
  - Typing updates `#askCount` to `n/300`.
  - Submitting `"Công việc?"` navigates to `/trai-bai` with state `{question:'Công việc?', autoPick:true}`.
  - `#askSkip` gives `question ''`.
  - `.lt-nav [data-go=browse]` navigates to `/tra-cuu`.
  - The tip rotation runs every 3800 ms and pauses while the input is focused or non-empty.
  - **Review Focus 5:** after unmount, `vi.getTimerCount()===0`.
  - **Review Focus 2:** with `dbStatus:'error'`, the CTA shows the error instead of spinning.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS.
- [ ] **Step 5:** Commit: `feat(landing): landing page with fan, rotating tips and ask form`.

---

### Task 7: Browse

**Files:** Create `src/features/browse/{Browse,SuitTiles,CardDetails}.tsx` plus tests.

**Interfaces:**
- Consumes: `CardsDb.query`, `createCardSearch`, `SUIT_META`, `seoCardPath`, `cardText`, and `<CorrChips card/>` (= legacy `corrChips` L1558, VI astro chip only, through `elementOfSuit`/`NUMEROLOGY*`/`astroGlyph`).
- Behaviour: port markup L944–961 and the logic of L1726–1874, covering `updateFilter` (smart matches first, deduped, filtered by category), `renderList` (auto-select first), `selectCard` (scroll on ≤980px), `renderCategoryTabs` (counts, top-3 images with lazy `data-src`, random `--j` jitter seeded per tile so it is stable across renders) and `syncPagesLink`.

- [ ] **Step 1: Write the failing tests** with the fixture DB in the store:
  - The list order and contents for the search `'vua kiếm'` equal the legacy `updateFilter` output. Compute the expected ids with the harness: legacy `queryCards` + `searchCards` merge logic.
  - Clicking a suit tile filters the list and sets `aria-pressed`. `#clearButton` clears the search and focuses the input.
  - An empty result shows `#noResults` and the placeholder detail.
  - Card details show the EN meaning when lang is `en` and `card_en` has the card, while VI-only sections are hidden in EN.
  - **Review Focus 1:** switching the language re-labels the suit tiles.
  - `#browsePagesLink` href is `/la-bai/<slug>/` for Witches and `/la-bai/` for an unknown deck.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS.
- [ ] **Step 5:** Commit: `feat(browse): card browser with suit tiles, smart search and details`.

---

### Task 8: Daily

**Files:** Create `src/features/daily/Daily.tsx` plus a test.

Port markup L1094–1103 and `renderDaily` L2476–2493. The day's card comes from `pickDailyCard(cards of deck, deck)`, always upright. The note is saved to `dailyNote:<dailyKey()>` on input. Include `#moonBadge`-style moon info only where the legacy Daily shows it.

- [ ] **Step 1: Write the failing test** with a fixed system time:
  - The card shown equals `pickDailyCard`.
  - Typing a note writes `localStorage['dailyNote:2026-1-5']`, and remounting shows the saved note.
  - Changing the deck re-renders the card.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS. **Step 5:** Commit: `feat(daily): card of the day with journal note`.

---

### Task 9: Site settings overlay

**Files:** Create `src/features/settings/SiteSettings.tsx` plus a test.

Port markup L1268–1337 and `initSiteSettings`/`initCardBack`/`initTheme`/`initCloudSave` (L2389–2471, L5677–5710, L2005–2016). Every control reads and writes through `useApp().setPref` / `setLang`. The language change triggers what legacy L2406 re-renders, which in React means everything subscribed to `lang`, and loads `card_en.json` when EN. Turning cloud save on also removes `tarotCloudBackfill` (legacy). The ambient and sound controls only store their values here; the engines arrive in 2c and will subscribe to the store.

- [ ] **Step 1: Write the failing tests.**
  - Each control persists its legacy key with the legacy value format: theme, fx, skyMode/skyCity (the city row is shown only for `real`), ritual, sound, sound volume, ambient mode, ambient volume, cloud save, card back. Clicking a `.cb-opt` sets `--cardback` and `.on`.
  - **Review Focus 3:** a stored `cardBack='plain'` renders `sacred` as selected.
  - Card-back names follow the current language. (Legacy rendered them once; this is a ruling.)
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS. **Step 5:** Commit: `feat(settings): site settings overlay`.

---

### Task 10: AI settings overlay and model tools

**Files:** Create `src/services/ai/models.ts`, `src/features/settings/AiSettings.tsx` plus tests.

**Interfaces:**
```ts
export const RECOMMENDED: { beeknoee: string[]; zenmux: string[] };              // verbatim L3047
export function orderModels(models: string[], preferred?: string[]): string[];  // legacy populateModels ordering (L3066–3082) without DOM
export function listModels(p: BYOKProvider, s: AiSettings, f?: typeof fetch): Promise<string[]>;   // L3141/3176/3253/3313 (paging for Gemini, proxy for ZenMux / Ollama cloud)
export function testModel(p: BYOKProvider, s: AiSettings, f?: typeof fetch): Promise<void>;        // L3199/3225/3277/3337; throws AiError with the legacy message
```
`<AiSettings>` ports markup L1156–1265. Provider tabs are UI-only until Save, as in legacy. Save builds the settings exactly as L3113–3137 (trim, strip trailing `/`, defaults) and shows the legacy `savedNote` text including the fallback chain (`providerChain` + provider labels).

- [ ] **Step 1: Write the failing tests.**
  - `orderModels` equals the legacy ordering for a list with recommended entries present and absent (normalised matching).
  - `listModels('gemini')` follows `nextPageToken` and keeps only models with `generateContent`.
  - ZenMux list and test calls go through `/api/llm`.
  - `testModel` errors carry the legacy messages.
  - The UI test: switch to the Ollama tab, change the URL to `http://x:11434/`, Save. Storage then has `ollamaUrl:'http://x:11434'`, the provider is `ollama`, and the saved note shows the chain.
  - Opening the overlay reloads the settings from storage. Esc closes it.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS. **Step 5:** Commit: `feat(settings): AI settings overlay with model listing and live test`.

---

### Task 11: Wire-up and visual parity check

**Files:** Modify `src/main.tsx` and `src/app/routes.tsx` as needed. Create `docs/superpowers/plans/plan-2a-parity.md` for the screenshots log.

- [ ] **Step 1:** Run `npm run dev` with the real `tarot.db` and `card_en.json` (served by the dev plugin from Plan 1). Open the legacy app with `npx serve .` on a second port.
- [ ] **Step 2:** Compare these screens side by side at 390×844 and 1440×900, in VI and EN, under the default and `light` themes: landing, daily, browse (one card selected), drawer, desktop nav, site settings, AI settings. Capture the screenshots with the browser tooling available (built-in browser or Playwright in a scratch script). List every visible difference in `plan-2a-parity.md`.
- [ ] **Step 3:** Fix each difference that comes from a markup mismatch, and record a ruling for any difference that is intended (Esc handling, re-labelled tiles).
- [ ] **Step 4:** Run `npm run check && npm run build` and expect both to exit 0. Commit: `feat(ui): plan 2a wired up; parity notes`.

---

## Done when

- `npm run check` and `npm run build` pass. Landing, Daily, Browse, nav and both settings overlays run against the real DB and match the legacy look in the parity log, with no unexplained differences.
- The legacy frozen files are unchanged. Nothing is pushed.
