# React Migration — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vite + React + TypeScript project next to the frozen legacy app, and move all non-UI logic (cards, SPREAD FACTS, prompts, share links, storage, IndexedDB, card DB, AI client, readings API) into typed, tested modules. Make the AI prompt a single source that both the client and `api/ai.js` use.

**Architecture:** The legacy `witches_tarot.html` stays untouched and keeps serving Production. Every ported function is checked against the **legacy code itself**: a test harness pulls named functions out of a frozen copy of the legacy HTML and runs them in a Node `vm` sandbox, and parity tests assert that the new TS function returns the same output for the same input. UI work starts in Plan 2. Plan 1 only renders an app shell.

**Tech Stack:** Node ≥22, Vite, React 18, TypeScript (strict), Zustand (installed now, used in Plan 2), Vitest + jsdom + fake-indexeddb + @testing-library/react, ESLint (typescript-eslint, react-hooks), Prettier, sql.js 1.10.3, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-19-react-migration-design.md`

**Later plans (written after this one lands, against the real interfaces):** Plan 2 = the screens (landing, browse, draw/reading, history, daily, yes/no, sky, settings) plus the `engines/`. Plan 3 = PWA, CSP, `vercel.json`, deploy script, Playwright, cutover.

## Global Constraints

- Work on local branch `react-migration`, created from `main` at `ed50a70` or later. Commit each task. **Never push.** Commit identity is the repo-local `TrungTruong32` config. Do not change it.
- `witches_tarot.html` is frozen. Do not edit it. Production deploy is untouched in this plan: do not run `scripts/deploy-prod.mjs` and do not edit `vercel.json`, `.vercelignore` or `sw.js`.
- Card data stays out of git: `tarot.db`, `card_en.json`, `la-bai/`, `Data/*.json|xlsx|db` (except `Data/template.json`). Tests use **synthetic fixtures only**. Never copy real card text into a fixture.
- Compatibility contract. Same names, same value formats:
  - localStorage keys: `witchesTarotAI`, `witchesTarotDeck`, `cardBack`, `dailyNote:*`, `tarotAmbient`, `tarotAmbientMode`, `tarotAmbientVol`, `tarotCloudBackfill`, `tarotCloudSave`, `tarotDeviceId`, `tarotFx`, `tarotLang`, `tarotRitual`, `tarotSkyCity`, `tarotSkyLayers`, `tarotSkyLoc`, `tarotSkyMode`, `tarotSound`, `tarotSoundVol`, `theme`.
  - IndexedDB: `witchesTarotDecks` version 2, stores `decks` (keyPath `deck`) and `readings` (keyPath `id`, autoIncrement).
  - Share links: `#r=` + `'1'`+base64url(deflate-raw JSON) or `'0'`+base64url(UTF-8 JSON).
- `api/ai.js` security invariants stay: `cleanMessages`, a server-built system prompt (client `system` messages dropped), and `GUARD` server-only. `api/readings.js` deck allowlist is not touched.
- Supabase: this plan adds no queries. Any future query must be a typed RPC (see spec §5.7).
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any` in `src/core` or `shared/`.

## Review Focus

1. **Legacy share links with Vietnamese text and emoji** must decode. A link made by the old `encodeShare` from a reading whose question contains diacritics and "✨" must round-trip through the new `decodeShare`. *Pinned in Task 6.*
2. **AI output containing HTML** (`<img onerror>`, `<script>`) must be escaped by `renderMarkdown`, since the old app put it into `innerHTML`. *Pinned in Task 6.*
3. **Provider fails after partial stream.** Once any token has streamed, the client must not fall back (no spliced answers). It must rethrow instead. *Pinned in Task 9.*
4. **localStorage unavailable** (Safari private mode throws). Every storage call must return the default and never throw. *Pinned in Task 7.*
5. **Records written by the legacy app** (no `spread`, `positions` or `facts` fields; `imported: true` entries) must read back and be skipped correctly by the backfill. *Pinned in Task 8 / Task 10.*

---

## File Structure

```
index.html                     Vite entry (new; does not replace witches_tarot.html)
vite.config.ts                 dev plugin serves legacy root static files (tarot.db, card_en.json, sky.json, images)
tsconfig.json  tsconfig.node.json  eslint.config.js  .prettierrc
.github/workflows/ci.yml
shared/
  prompt.js  prompt.d.ts       system prompt, single source for client + api (plain ESM so api/ can import it)
src/
  main.tsx  App.tsx            shell only
  core/
    types.ts                   Card, Orientation, Lang, SpreadCard, Reading
    cards.ts                   elements, numerology, astroGlyph, isMajorCard, romanToInt, cardNumber, dignity, cardText
    facts.ts                   computeSpreadFacts, factLines
    spreads.ts                 SPREADS, SPREAD_LAYOUT, spreadByKey, defsFor, posDesc
    prompt.ts                  promptMeaning, buildUserPrompt (re-exports buildSystemPrompt from shared/)
    share.ts                   encodeShare, decodeShare, buildShareData
    markdown.ts                escapeHtml, renderMarkdown
  services/
    storage.ts                 typed localStorage registry
    idb.ts                     readings journal
    cardsDb.ts                 sql.js loader + queries
    ai/sse.ts                  streamLines
    ai/providers.ts            callGemini, callOpenAICompat, callOllama, callFree, proxyFetch
    ai/chat.ts                 providerChain, chatComplete
    readingsApi.ts             cloudPayload, cloudSaveReading, cloudBackfill
tests/
  legacy/witches_tarot.legacy.html   frozen copy of the legacy file (no card data in it)
  legacy/harness.ts                  loadLegacy(names, globals) → functions from the legacy script
  fixtures/cards.ts                  synthetic cards (both decks, majors, minors, courts)
  fixtures/makeDb.ts                 builds an in-memory sql.js DB with the `cards` schema
  (unit tests sit next to the code as *.test.ts)
```

---

### Task 1: Scaffold, tooling, CI, legacy harness

**Files:**
- Create: `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `eslint.config.js`, `.prettierrc`, `src/main.tsx`, `src/App.tsx`, `.github/workflows/ci.yml`, `tests/legacy/witches_tarot.legacy.html` (byte copy), `tests/legacy/harness.ts`, `tests/legacy/harness.test.ts`
- Modify: `package.json` (keep `@vercel/speed-insights`; add `"type": "module"`, scripts, devDeps), `.gitignore` (add `/dist/`)

**Interfaces:**
- Produces: `loadLegacy<T extends Record<string, Function>>(names: string[], globals?: Record<string, unknown>): T` in `tests/legacy/harness.ts`. It reads the legacy file, takes the body of the large inline `<script>` (the one after the sql-wasm `<script src>`), extracts each `function <name>(` declaration and each `const <NAME> =` declaration by brace/bracket matching, evaluates them in `vm.createContext({ ...globals, console, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent })` in source order, and returns the named bindings. Callers name every function and const they need, dependencies included.
- Produces: npm scripts `dev`, `build`, `preview`, `test` (vitest run), `test:watch`, `typecheck` (tsc -b --noEmit), `lint`, `format`, `check` (= typecheck && lint && test).

- [ ] **Step 1:** `git switch -c react-migration`. Confirm with `git status` that the tree is clean apart from `docs/superpowers/`. Commit those docs first: `git add docs/superpowers && git commit -m "docs: React migration design + plan 1"`.
- [ ] **Step 2:** Scaffold the config files listed above. `"type": "module"` is safe because `api/*.js` already use `import`. Check that `scripts/*.mjs` and `Data/*.py` are unaffected. Vite `publicDir: false`. Add a dev-only plugin in `vite.config.ts` that serves these repo-root files when they exist: `tarot.db`, `card_en.json`, `sky.json`, `cardback.png`, `cardback-witches.webp`, `icon-*.png`, `apple-touch-icon.png`, `manifest.webmanifest`, `og-image.jpg`. `App.tsx` renders only `<h1>Witches Tarot</h1>`.
- [ ] **Step 3:** Copy `witches_tarot.html` byte-for-byte to `tests/legacy/witches_tarot.legacy.html`.
- [ ] **Step 4: Write the failing harness test** `tests/legacy/harness.test.ts`:
```ts
const L = loadLegacy<{ romanToInt(s: string): number | null; dignity(a: string|null, b: string|null): string|null }>(['romanToInt', 'dignity']);
expect(L.romanToInt('XIV')).toBe(14);
expect(L.romanToInt('7')).toBe(7);
expect(L.romanToInt('abc')).toBeNull();
expect(L.dignity('fire', 'air')).toBe('support');
expect(() => loadLegacy(['noSuchFunction'])).toThrow(/noSuchFunction/);
```
- [ ] **Step 5:** `npm test`. Expect FAIL (harness missing). Implement `harness.ts`, then run `npm test` again and expect PASS.
- [ ] **Step 6:** Write `.github/workflows/ci.yml`: on push and pull_request, Node 22, `npm ci`, `npm run check`. Run `npm run check` and `npm run build` locally. Both must exit 0.
- [ ] **Step 7:** Commit: `chore: scaffold Vite + React + TS, tooling, CI, legacy parity harness`.

---

### Task 2: Shared system prompt (client + server single source)

**Files:**
- Create: `shared/prompt.js`, `shared/prompt.d.ts`, `shared/prompt.test.ts`, `shared/__golden__/system-{vi,en}-{client,server}.txt`, `scripts/dump-legacy-prompts.mjs`
- Modify: `api/ai.js:43-72` (delete the local `systemPrompt`, import the shared one)

**Interfaces:**
- Produces: `buildSystemPrompt(lang: 'vi' | 'en', deckLabel: string, opts?: { followups?: boolean }): string`. The client calls it with `followups` false (the default), and `api/ai.js` calls it with `{ followups: true }`. The follow-up line goes in **second-to-last** position, exactly as in the current server text.

- [ ] **Step 1:** Write `scripts/dump-legacy-prompts.mjs`. It loads the legacy client `buildSystemPrompt` through the harness (stub global `lang`) and the server `systemPrompt` (copy `api/ai.js` to a temp `.mjs`, append `export { systemPrompt }`, then import it). It writes the four golden files for deckLabel `"Witches Tarot"`. Run it once and commit the golden files.
- [ ] **Step 2: Write the failing test** `shared/prompt.test.ts`. For each of the 4 combos, `buildSystemPrompt(lang, 'Witches Tarot', { followups })` must `toBe` the golden file contents. Also check: deckLabel `'Rider-Waite'` appears verbatim on line 2, and `followups:false` output has exactly one line fewer than `followups:true`.
- [ ] **Step 3:** Run `npx vitest run shared/prompt.test.ts`. Expect FAIL.
- [ ] **Step 4:** Implement `shared/prompt.js` as plain ESM with a `// @ts-check` header, plus the matching `prompt.d.ts`.
- [ ] **Step 5:** Run the test again and expect PASS.
- [ ] **Step 6:** In `api/ai.js`, add `import { buildSystemPrompt } from '../shared/prompt.js';` and replace the call at line 272 with `buildSystemPrompt(body?.lang === 'en' ? 'en' : 'vi', deckLabelOf(body?.deck), { followups: true })`. Leave `GUARD`, `cleanMessages` and `deckLabelOf` untouched.
- [ ] **Step 7:** Add a test `api/ai.prompt.test.ts` asserting that `api/ai.js` source no longer contains `function systemPrompt(` and does contain `followups: true`. Run `node -e "import('./api/ai.js')"` and expect no error.
- [ ] **Step 8:** Commit: `refactor: single-source AI system prompt shared by client and api/ai.js (golden-tested)`.

---

### Task 3: Core types and card correspondences

**Files:**
- Create: `src/core/types.ts`, `src/core/cards.ts`, `src/core/cards.test.ts`, `tests/fixtures/cards.ts`

**Interfaces:**
- Produces in `types.ts`:
```ts
export type Lang = 'vi' | 'en';
export type Orientation = 'xuoi' | 'nguoc';
export type Element = 'fire' | 'water' | 'air' | 'earth';
export interface Card { id: number; deck: string | null; bo: string; so: string; ten: string; url?: string; mo_ta_hinh_anh?: string; y_nghia_xuoi: string; nghia_nguoc: string; tu_khoa?: string; than_thanh?: string; chiem_tinh_hoc?: string; cac_nguyen_to_lien_quan?: string; content?: string; image_url?: string; }
export interface SpreadCard extends Card { orientation: Orientation; uid?: number; }
export type CardEnMap = Record<number, { kw: string; up: string; rev: string }>;
export interface CardText { ten: string; tu_khoa?: string; y_nghia_xuoi: string; nghia_nguoc: string; }
```
- Produces in `cards.ts`: `ELEMENTS`, `NUMEROLOGY`, `NUMEROLOGY_EN`, `MAJOR_NAMES` (values copied verbatim from legacy lines 1512–1536, 1573), `elementOfSuit(bo: string): Element | null`, `astroGlyph(txt: string): string`, `isMajorCard(c: Pick<Card,'bo'>): boolean`, `romanToInt(s: string): number | null`, `cardNumber(c: Pick<Card,'bo'|'so'>): number | null`, `dignity(a: Element|null, b: Element|null): 'same'|'support'|'oppose'|null`, `cardText(c: Card, lang: Lang, cardEn: CardEnMap | null): CardText`.
- Produces in `tests/fixtures/cards.ts`: `fx` with synthetic cards named `fx.fool`, `fx.tower`, `fx.aceWands`, `fx.threeWands`, `fx.threeCups`, `fx.kingSwords`, `fx.queenPentacles`, `fx.fiveSwords`, `fx.rwFool`. Witches cards use `deck: 'Witches Tarot'`, `fx.rwFool` uses `'Rider-Waite'`. Use `bo` values `'Bo An Chinh'`, `'Bo Wands'`, `'Bo Cups'`, `'Bo Swords'`, `'Bo Pentacles'`, plus a `withOrientation(card, o)` helper. Meanings are short made-up strings.

- [ ] **Step 1: Write the failing parity test.** Load the legacy `elementOfSuit, astroGlyph, isMajorCard, romanToInt, cardNumber, dignity` and assert the new functions match on these inputs: every fixture card; `bo` strings `'Gậy'`, `'Chén'`, `'Kiếm'`, `'Đồng tiền'`, `'Major Arcana'`, `''`; `so` values `'0','I','XXI','Ace','Át','10','Page','King'`; all 16 element pairs, plus null; astro strings `'Cung Bạch Dương.'`, `'Mặt Trăng'`, `'xyz'`. For `cardText`: an EN map entry is applied only when `lang==='en'` and the deck is `'Witches Tarot'` or null. A Rider-Waite card keeps its own text.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(core): typed card model and occult correspondences (legacy-parity tested)`.

---

### Task 4: SPREAD FACTS

**Files:**
- Create: `src/core/facts.ts`, `src/core/facts.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
```ts
export interface SpreadFacts { n: number; known: number; majors: number; minors: number; reversed: number; courts: number[]; elements: Record<Element, number>; numbers: Record<number, number[]>; dignities: { a: number; b: number; kind: 'same'|'support'|'oppose' }[]; sum: number | null; quint: number | null; }
export function computeSpreadFacts(cards: SpreadCard[]): SpreadFacts;
export function factLines(cards: SpreadCard[], f: SpreadFacts, lang: Lang, majorName: (n: number) => string | null): string[];
```
`majorName` replaces the legacy `majorNameIn` DB lookup. Callers pass `n => cardsDb.majorNameIn(deck, n) ?? MAJOR_NAMES[n] ?? null`.

- [ ] **Step 1: Write the failing parity test.** Load the legacy `computeSpreadFacts`, `factLines` and their dependencies, with globals `{ lang, db: null }`. For each spread case below, in both `lang` values, compare `computeSpreadFacts` deep-equal and `factLines` exact arrays. Pass `majorName = n => MAJOR_NAMES[n] ?? null`, which is what the legacy code does with `db: null`.
  - `[]`
  - 1 card
  - 3 cards all upright
  - 4 cards, 2 reversed (reversed-heavy)
  - 5 cards with 2 courts and a repeated number 3
  - 10 Celtic-size mixed
  - a set whose numbers sum past 21 (quintessence reduction)
  - a spread containing a card with unknown `bo` (`known < n` → no Major ratio line)
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(core): SPREAD FACTS computed by code (legacy-parity tested)`.

---

### Task 5: Spreads and the user prompt

**Files:**
- Create: `src/core/spreads.ts`, `src/core/prompt.ts`, `src/core/spreads.test.ts`, `src/core/prompt.test.ts`

**Interfaces:**
- Produces in `spreads.ts`: `interface SpreadDef { k: string; vi: string; en: string; use: [string, string]; pos: [string, string, string, string][] | null }`, `SPREADS: SpreadDef[]` (copied verbatim from the legacy `SPREADS` array), `SPREAD_LAYOUT: Record<string, [number, number, 1?][]>`, `CARD_H = 1.75`, `spreadByKey(k): SpreadDef | undefined`, `defsFor(k, lang): string[] | null`, `posDesc(k, i, lang): string`.
- Produces in `prompt.ts`:
```ts
export function promptMeaning(txt: string): string;
export interface UserPromptInput { question: string; cards: SpreadCard[]; spreadKey: string; positions: string[] | null; lang: Lang; cardEn: CardEnMap | null; majorName: (n: number) => string | null; }
export function buildUserPrompt(i: UserPromptInput): string;
export { buildSystemPrompt } from '../../shared/prompt.js';
```

- [ ] **Step 1: Write the failing parity tests.**
  - spreads: legacy `SPREADS`, `SPREAD_LAYOUT` and `posDesc` deep-equal the new ones for every key and every index, in both langs.
  - prompt: legacy `buildUserPrompt` is driven through globals `{ lang, spread, spreadKey, spreadPositions, questionInput: { value }, CARD_EN, db: null }` plus its dependencies. The output must be exactly equal for these cases, in both langs:
    - empty question
    - multi-deck spread (deck tags)
    - `celtic` with positions
    - `free` without positions
    - a card whose meaning is over 1200 chars with `Dẫn nhập:` and `Tổng quan:` lines (truncation path)
    - the same over 1500 chars with no such lines
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(core): spread definitions and user prompt builder (legacy-parity tested)`.

---

### Task 6: Share links and safe markdown

**Files:**
- Create: `src/core/share.ts`, `src/core/markdown.ts`, `src/core/share.test.ts`, `src/core/markdown.test.ts`

**Interfaces:**
- Produces in `share.ts`:
```ts
export interface ShareData { q: string; d: string; p: string; a: string; c: ([number, 0|1] | [-1, 0|1, string, string?, string?, string?, string?])[] }
export function encodeShare(obj: ShareData): Promise<string>;
export function decodeShare(s: string): Promise<ShareData | null>;
export function buildShareData(i: { question: string; decks: string[]; fallbackDeck: string | null; spreadKey: string; answer: string; cards: SpreadCard[] }): ShareData;
```
- Produces in `markdown.ts`: `escapeHtml(s: unknown): string`, `renderMarkdown(src: string): string`. Both must equal the legacy output.

- [ ] **Step 1: Write the failing tests.**
  - **Review Focus 1:** use the legacy `encodeShare` to encode a ShareData with `q: 'Tình yêu của tôi sẽ ra sao? ✨'`, a long `a`, and 3 cards. The new `decodeShare` must deep-equal the original, for both the compressed ('1') and the plain ('0') forms. Force the '0' form by encoding a tiny object.
  - New encode → legacy decode must also round-trip.
  - `decodeShare('garbage')`, `decodeShare('1!!!')` and `decodeShare('')` must all return `null`.
  - `buildShareData` must match the legacy output for a spread that has a card with `id: -1`.
  - markdown: the output must equal the legacy `renderMarkdown` on a corpus of bold, italic, headings, bullets, inline code and newlines.
  - **Review Focus 2:** `renderMarkdown('<img src=x onerror=alert(1)> <script>x</script> **"a"**')` contains no `<img`, no `<script`, and does contain `&lt;img`.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(core): share-link codec compatible with legacy links; XSS-safe markdown`.

---

### Task 7: Typed localStorage

**Files:**
- Create: `src/services/storage.ts`, `src/services/storage.test.ts`

**Interfaces:**
- Produces:
```ts
export const KEYS: { readonly aiSettings: 'witchesTarotAI'; readonly deck: 'witchesTarotDeck'; readonly cardBack: 'cardBack'; readonly lang: 'tarotLang'; readonly theme: 'theme'; readonly deviceId: 'tarotDeviceId'; readonly cloudSave: 'tarotCloudSave'; readonly backfill: 'tarotCloudBackfill'; readonly ritual: 'tarotRitual'; readonly sound: 'tarotSound'; readonly soundVol: 'tarotSoundVol'; readonly ambient: 'tarotAmbient'; readonly ambientMode: 'tarotAmbientMode'; readonly ambientVol: 'tarotAmbientVol'; readonly fx: 'tarotFx'; readonly skyMode: 'tarotSkyMode'; readonly skyCity: 'tarotSkyCity'; readonly skyLoc: 'tarotSkyLoc'; readonly skyLayers: 'tarotSkyLayers' };
export function getStr(key: string, fallback: string): string;
export function setStr(key: string, value: string): void;
export function remove(key: string): void;
export function getJson<T>(key: string, fallback: T): T;
export const dailyNoteKey: (day: string) => `dailyNote:${string}`;
export function allDailyNotes(): Record<string, string>;
export interface AiSettings { provider: 'gemini'|'beeknoee'|'zenmux'|'ollama'; geminiKey: string; geminiModel: string; beeknoeeKey: string; beeknoeeModel: string; beeknoeeUrl: string; zenmuxKey: string; zenmuxModel: string; zenmuxUrl: string; ollamaUrl: string; ollamaModel: string; ollamaKey: string; autoFallback: boolean; freeAi?: boolean; }
export const DEFAULT_AI_SETTINGS: AiSettings;   // values verbatim from legacy line 3026
export function loadAiSettings(): AiSettings;     // Object.assign({}, DEFAULT, parsed) like legacy
export function saveAiSettings(s: AiSettings): void;
export function deviceId(): string | null;        // same regex + crypto.randomUUID behavior as legacy
```

- [ ] **Step 1: Write the failing tests.**
  - Every `KEYS` value equals the contract list in Global Constraints. Snapshot the sorted list against the literal list there.
  - `loadAiSettings` merges a partial stored JSON over the defaults, and returns the defaults on corrupt JSON.
  - `deviceId` keeps a valid stored UUID, and replaces `'abc'` with a new UUID that it persists.
  - `allDailyNotes` returns only non-blank `dailyNote:*` entries, with the prefix stripped.
  - **Review Focus 4:** with `localStorage.getItem` and `setItem` stubbed to throw, `getStr` returns the fallback, `setStr` doesn't throw, `loadAiSettings` returns the defaults, and `deviceId` returns `null`.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(services): typed localStorage with legacy key contract`.

---

### Task 8: IndexedDB reading journal

**Files:**
- Create: `src/services/idb.ts`, `src/services/idb.test.ts` (uses `fake-indexeddb/auto`)
- Modify: `src/core/types.ts` (add `Reading`)

**Interfaces:**
- Produces in `types.ts`: `interface Reading { id?: number; ts: number; deck: string; question: string; provider: string; text: string; followups: { q: string; a: string }[]; note: string; spread?: string; positions?: string[] | null; facts?: string[]; cards: Pick<SpreadCard,'id'|'deck'|'ten'|'bo'|'so'|'y_nghia_xuoi'|'nghia_nguoc'|'tu_khoa'|'image_url'|'orientation'>[]; imported?: boolean }`. Check the follow-up item shape against the legacy chat code (`chatMessages` / `followups.push`) before you fix it.
- Produces in `idb.ts`: `addReading(r: Reading): Promise<number>` (sets `r.id`), `updateReading(r)`, `allReadings(): Promise<Reading[]>`, `deleteReading(id)`, `clearReadings()`, `clearOldDecks()`. DB name, version and stores are exactly as in Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - **Review Focus 5:** open the DB with the legacy `idbOpen` and `idbAddReading` from the harness (globals `{ indexedDB }`) and write a legacy-shaped record that has no `spread`, `positions` or `facts`, plus one with `imported: true`. The new `allReadings()` must return both unchanged.
  - add → update → all → delete → clear works.
  - `addReading` sets `r.id`.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(services): IndexedDB journal compatible with legacy schema v2`.

---

### Task 9: AI client (providers, streaming, fallback)

**Files:**
- Create: `src/services/ai/sse.ts`, `src/services/ai/providers.ts`, `src/services/ai/chat.ts`, plus `*.test.ts` for each

**Interfaces:**
- Consumes: `AiSettings`, `deviceId` (Task 7).
- Produces:
```ts
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderId = 'free' | 'gemini' | 'beeknoee' | 'zenmux' | 'ollama';
export type OnToken = (t: string) => void;
export type OnReasoning = (t: string) => void;
export class AiError extends Error { constructor(message: string, readonly status?: number, readonly scope?: string) }
// sse.ts
export function streamLines(res: Response, onLine: (line: string) => void): Promise<void>;
// providers.ts — all take (messages, onToken, onReasoning?, ctx) where ctx = { settings: AiSettings; lang: Lang; deck: string; fetch?: typeof fetch }
export function proxyFetch(target: string, init?: RequestInit, f?: typeof fetch): Promise<Response>;  // POST/GET /api/llm with x-target-url
export function ollamaIsLocal(base: string): boolean;
export const PROVIDERS: Record<ProviderId, ProviderCall>;
export interface FreeAiInfo { model: string; remaining: number | null }
export function callFree(...): Promise<FreeAiInfo>;   // also strips system messages before POST /api/ai
// chat.ts
export const PROVIDER_ORDER: Exclude<ProviderId,'free'>[];   // copy from legacy
export function providerReady(p: ProviderId, s: AiSettings): boolean;  // port legacy providerReady
export function providerChain(s: AiSettings): ProviderId[];           // port legacy line 2157
export function chatComplete(messages: ChatMessage[], cb: { onToken: OnToken; onReasoning?: OnReasoning; onSwitch?: (from: ProviderId, to: ProviderId, e: unknown) => void }, ctx: ProviderCtx, calls?: Record<ProviderId, ProviderCall>): Promise<ProviderId>;
```
Error messages keep the legacy VI/EN texts, keyed on `ctx.lang`. The free-AI 429/400/502/503 mapping is copied verbatim from legacy lines 3615–3630.

- [ ] **Step 1: Write the failing tests.** Build `Response`s from a `ReadableStream` that yields chunks split mid-line.
  - `streamLines` reassembles lines across chunks and flushes the final unterminated line.
  - Gemini SSE `data: {candidates:[{content:{parts:[{text:'a'}]}}]}` → tokens. The request body has `systemInstruction` from the system messages, and the `assistant` role is mapped to `model`.
  - OpenAI-compatible SSE `delta.content` and `delta.reasoning_content` route to `onToken` and `onReasoning`. `[DONE]` is ignored. ZenMux goes through `/api/llm` with an `x-target-url` header, and Beeknoee does not.
  - Ollama NDJSON `message.content` and `message.thinking`. A local URL calls `fetch` directly, while `https://ollama.com` goes through the proxy.
  - `callFree` POSTs `{device_id, lang, deck, messages}` without any system message. It reads the `x-ai-provider` and `x-ai-remaining` headers. A 429 with `{scope:'device', limit:10}` maps to the legacy device message.
  - `providerChain` equals the legacy `providerChain` (harness, globals `{ settings, PROVIDER_ORDER }` plus `providerReady` and its deps) for a matrix of: provider × keys present/absent × `autoFallback` true/false × `freeAi` true/false.
  - `chatComplete` falls back when the first provider throws before any token, and calls `onSwitch(from, to)`. It falls back on an empty response when there is a next provider.
  - **Review Focus 3:** when the first provider emits `'abc'` then throws, `chatComplete` rejects with that error, never calls the second provider, and `onToken` received only `'abc'`.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. Inject `fetch` through `ctx.fetch` so tests never touch the network. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit: `feat(services): streaming AI client with provider fallback (BYOK, Ollama, free endpoint)`.

---

### Task 10: Card DB (sql.js) and readings API

**Files:**
- Create: `src/services/cardsDb.ts`, `src/services/readingsApi.ts`, `tests/fixtures/makeDb.ts`, `src/services/cardsDb.test.ts`, `src/services/readingsApi.test.ts`

**Interfaces:**
- Produces in `cardsDb.ts`:
```ts
export interface CardsDb { query(o: { deck: string | null; category?: string; text?: string; limit?: number }): Card[]; decks(): string[]; majorNameIn(deck: string, n: number): string | null; byId(id: number): Card | null; }
export function openCardsDb(bytes: Uint8Array, SQL: SqlJsStatic): CardsDb;
export function loadCardsDb(url?: string): Promise<CardsDb>;  // default '/tarot.db'; sql.js wasm from the npm package (sql.js@1.10.3), not the CDN
export const SEARCH_COLS: readonly string[];  // verbatim legacy line 1501
```
- Produces in `readingsApi.ts`: `cloudPayload(r: Reading, lang: Lang)` (field mapping identical to legacy lines 4267–4274), `cloudSaveReading(r: Reading, lang: Lang, f?: typeof fetch): void`, `cloudBackfill(lang: Lang, f?: typeof fetch): Promise<void>` (≤25 per batch, ≤700000 chars; 410 → done; 400 → skip batch; other non-ok → stop without marking done; sets `tarotCloudBackfill=done`).
- Produces in `tests/fixtures/makeDb.ts`: `makeDb(cards: Card[]): Promise<Uint8Array>`. It creates the `cards` table with the legacy column set: `id`, `deck` + the legacy `CARD_FIELDS`.

- [ ] **Step 1: Write the failing tests.**
  - `query` matches the legacy `queryCards` (harness, globals `{ db, selectedDeck }`) on the same fixture DB for: no filter, deck filter, category filter, text `'wands'`, a text with `%`, and a limit.
  - `majorNameIn('Rider-Waite', 0)` returns the fixture RW name, and returns `null` for an unknown deck.
  - `cloudPayload` equals the legacy output (globals `{ lang }`) for a reading that has positions and one that doesn't.
  - Backfill (**Review Focus 5**):
    - `imported` and card-less records are skipped.
    - 30 records are sent as 2 batches.
    - A 410 stops and marks done.
    - A 503 leaves the backfill key unset.
    - With `tarotCloudSave='0'`, nothing is sent.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Run `npm run check && npm run build` and expect both to exit 0. Commit: `feat(services): sql.js card DB and anonymous readings API client`.

---

## Done when

- `npm run check` and `npm run build` pass on `react-migration`, and every Task 1–10 commit is present locally (not pushed).
- `api/ai.js` builds its prompt from `shared/prompt.js`, and the golden tests pass.
- `witches_tarot.html`, `vercel.json`, `.vercelignore` and `sw.js` are unchanged: `git diff main -- witches_tarot.html vercel.json .vercelignore sw.js` is empty.

---

## Outcome (2026-11-19)

Done on local branch `react-migration`, commits `c2eee23..dfb14ad`, not pushed. `npm run check` reports 125 tests passing, and `npm run build` passes. A whole-branch review by a fresh reviewer found no Critical issues. All three Important findings were fixed:
- Tests were moved out of `api/`.
- `deploy-prod.mjs` now refuses to deploy from any branch other than `main`.
- The Vite dev server now refuses secret files.

**Carry forward into Plan 2** (deferred minors and rulings that the UI work must respect):
- `decodeShare` returns unvalidated JSON. Before rendering, custom-card fields (`ten`, `image_url`, …) must go through `escapeHtml` or a URL check.
- `cardsDb.majorNameIn` has no fallback. Callers compose `majorNameIn(deck, n) ?? MAJOR_NAMES[n] ?? null`, picking the deck from the first card that has one, as the legacy code did.
- `chatComplete` returns only the provider id. Free-AI info (`FreeAiInfo` from `callFree`) has to be threaded out for the saved `"free · <model>"` provider label.
- Golden system prompts cover only the `"Witches Tarot"` label. Add a harness comparison across deck labels if the prompt is touched.
- Legacy card data in the wild may contain `id: -1` custom cards (from the removed deck import).
