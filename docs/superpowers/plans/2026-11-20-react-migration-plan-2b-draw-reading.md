# React Migration — Plan 2b: Draw Engine, AI Reading, History, Yes/No

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four remaining `<ComingSoon/>` screens that hold the app's core value: Draw (`/boc-bai`), AI Reading (`/trai-bai`, including `#r=` share links), History (`/nhat-ky`) and Yes/No (`/yes-no`). They must behave like legacy, except for the Draw tab, which gets the §5.8 redesign.

**Architecture:**
- Animation, audio and canvas code stays imperative in `src/engines/` (spec §5.3), each with a small `start/stop` API.
- React components own state and layout. They mount the engines through refs.
- The shuffle → wheel → reveal pipeline lives in one `DrawStage` component that both Draw and AI Reading use (§5.8).
- Reading state (question, spread, conversation, current journal record) lives in a Zustand store, `useReading`, so it survives route changes the way legacy kept a hidden view.
- Pure logic that is still inside legacy UI code is ported to `src/core/` first, with the legacy-parity harness.

**Tech Stack:** As Plan 2a: React 18, TS strict, Zustand 5, react-router 6, Vitest + RTL + fake-indexeddb, legacy harness (`tests/legacy/harness.ts`).

**Spec:** `docs/superpowers/specs/2026-11-19-react-migration-design.md`, in particular §5.3 (engines), §5.5 (checklist) and **§5.8 (Draw tab redesign)**.
**Inputs:** Plan 1/2a modules (`src/core/*`, `src/services/*`, `src/app/store.ts`, `src/components/*`), the legacy inventory (`docs/superpowers/research/legacy-ui-inventory.md` §1.3–1.7, §4.3–4.5, §4.7–4.9). Line numbers are for `witches_tarot.html` (== `tests/legacy/witches_tarot.legacy.html`).

## Global Constraints

- Everything in Plan 1 and Plan 2a Global Constraints still applies:
  - branch `react-migration`; never push; legacy frozen;
  - fixtures only, no real card data;
  - verbatim CSS (no new CSS rules in `src/styles/`);
  - legacy ids, classes and attributes in the JSX;
  - i18n through `useT` (`t(key)`, or `pick({vi,en})` with the exact legacy texts);
  - every effect cleans up its listeners, timers, rAFs and animations.
- **Storage contract:**
  - IndexedDB records are written in the exact legacy `Reading` shape (`saveReading` L4238): `provider` = `providerLabel(p)` text, `facts` = `factLines`, `positions`, `spread`.
  - `followups` and `note` are updated through `updateReading`.
  - `cloudSaveReading` is called exactly where legacy calls it (only when `prefs.cloudSave`, never for `imported`).
- **Share links:**
  - `#r=` links made by legacy must open: `decodeShare` and then `loadReading`.
  - Links made by React must open in legacy: `encodeShare(buildShareData(...))`, the Plan 1 functions, unchanged.
  - Decoded custom-card fields (`id:-1`: `ten`, `bo`, `image_url`, …) are untrusted:
    - text is rendered as text, never as HTML;
    - `image_url` is kept only if it is an `https:` URL; otherwise it is dropped.
- **Free-AI label:**
  - Carry-forward from Plan 1: `chatComplete` must surface the `FreeAiInfo` returned by `callFree`.
  - The saved provider label and `#aiQuota` use it (legacy `providerLabel('free')`, `updateProviderLabel`).
- **Major-name lookup:**
  - Facts use `n => db.majorNameIn(deck, n) ?? MAJOR_NAMES[n] ?? null`.
  - `deck` is the `deck` of the first card that has one (carry-forward).
- **One draw at a time across both screens:**
  - Starting a draw on either screen cancels any draw in progress elsewhere (legacy `startOrbit` bumps every ctx session).
  - No timer from a cancelled draw may touch the new one.
- **Reduced motion:** every delay in the draw/deal/reveal pipeline collapses to 0 under `prefers-reduced-motion: reduce`, and the shuffle is skipped (L4947).
- **§5.8 parity exception:** only `/boc-bai` intentionally differs from legacy. AI Reading gets only the renamed buttons and hint lines; everything else matches.

## Review Focus

1. **Cancelled draws.**
   - Start a draw on Draw, switch to AI Reading and start another (or leave the route mid-wheel).
   - No card from the first draw may land in the second, and no timer may fire after unmount.
   - *Pinned in Task 4.*
2. **Hostile share link.** A `#r=` link with a custom card whose `ten` is `<img src=x onerror=alert(1)>` and whose `image_url` is `javascript:alert(1)` must render the name as text and show no image. *Pinned in Task 8.*
3. **Provider fails mid-stream / falls back.**
   - When the free AI fails before the first token, the fallback note shows and the answer still streams.
   - When it fails after tokens, the error shows, and the reading is not saved.
   - The button re-enables either way.
   - *Pinned in Task 7.*
4. **Old journal data.**
   - History must render legacy records without `followups`, `facts`, `positions` or `spread`, and imported records.
   - Import must dedupe by `ts|question` and never cloud-sync imported records.
   - *Pinned in Task 9.*
5. **Language switch with a reading on screen.** Spread rows, board titles, facts box and the spread picker re-render in the new language. The AI answer text stays as written (legacy). *Pinned in Task 6.*

---

## File Structure

```
src/core/
  spreadUi.ts          SPREAD_UI, freeLayout, layoutGeom, ROW3 (L2646–2685) — pure
  draw.ts              drawRandomCards(cards, n, rng), toSpreadCard, readDrawCount (L4556–4580)
  yesno.ts             YN_MAYBE, firstSentence, localVerdict, ynClass, yesNoSystemPrompt, parseVerdict (L2136–2230)
  journal.ts           readingHaystack, orientLabel, exportJson/exportMarkdown builders, mergeImport (L4376–4552)
  safeShare.ts         sanitizeShared(ShareData) → ShareData (escape-free text, https-only image_url)
src/engines/
  audio.ts             shared AudioContext + sfx (ensureAudio, cardFlick, cardWhoosh, cardThump, revealChime, startTicks, stopTicks, stopShuffleAudio, playTick) L4595–4757
  zodiacWheel.ts       zodiacWheelHTML() verbatim L5330
  shuffle.ts           startShuffle(el, count, audio) → { stop() }   (L4813–4930: buildOrbit/vortexCycle/startShuffleLoop)
  wheel.ts             startWheel(fanEl, opts) → { cancel() }          (L5353–5478 startManualPick)
  deal.ts              dealBoard(boardEl, done) → cancel               (L2767)
  burst.ts             burstAt(el, n) — calls window.tarotBurst if present (starfield lands in Plan 2c); haptic(ms)
src/components/spread/
  SpreadPicker.tsx     tile picker + ‹ › nav (L2692–2731), value/onChange props
  SpreadBoard.tsx      board slots + cards (renderBoard L2733), imperative deal(): Promise<void> via ref
  DrawStage.tsx        buttons + orbit + status + fan for one ctx ('draw' | 'reading'); ritual; singleton session
  RitualOverlay.tsx    #ritualOverlay (L841–848, beginDraw L5105) — mounted once in Root
src/features/draw/Draw.tsx                 §5.8 Draw tab
src/features/reading/
  readingStore.ts      useReading (question, spreadKey, cards, uid, chat, answer, provider, current record, aiBg mode)
  Reading.tsx          two-panel layout (#readingView markup L985–1075)
  Steps.tsx            step 1–4 panel (question chips, picker, draw, manual-add search, list, facts, actions, cloud note)
  SpreadList.tsx       .spread-item rows (renderSpread L2969)
  ResultPanel.tsx      #resultPanel: AiStream output, chat follow-up, TTS, share buttons, note
  AiStream.tsx         streaming renderer (streamInto L3669): spinner, live reasoning → think-box, markdown, fallback note, errors
  aiCardsBg.ts         engine for #aiCardsBg (L3702–3770)
  interpret.ts         runInterpret / runFollowUp orchestration (L3774–3855), saveReading (L4238)
  share.ts             shareReadingLink (L4056), exportReadingImage (L3857–4004), loadReading (L4314)
src/features/history/History.tsx (+ HistoryItem.tsx)
src/features/yesno/YesNo.tsx
src/services/ai/chat.ts        chatComplete returns { provider, free?: FreeAiInfo }  (carry-forward)
```

Routes: `SCREENS` in `src/app/routes.tsx` gets the four new screens; `<RitualOverlay/>` mounts in `Root`.

---

### Task 1: Pure helpers (spread UI geometry, draw, yes/no, journal, safe share) + chatComplete free info

**Files:** Create `src/core/{spreadUi,draw,yesno,journal,safeShare}.ts` + tests. Modify `src/services/ai/chat.ts` (+ its test and callers).

**Interfaces (Produces):**
```ts
// spreadUi.ts
export const SPREAD_UI: Record<string, { n: [string, string]; t: [string, string]; b?: [string, string]; use?: [string, string] }>;
export interface Geom { W: number; H: number; ar: string; items: { r: boolean; left: string; top: string; width: string; height: string }[] }
export function layoutGeom(pts: LayoutSlot[]): Geom;
export function freeLayout(n: number): LayoutSlot[];
export function boardWidth(g: Geom): string;            // renderBoard --bw: Math.round(W*(W<=1.2?120:W>4?82:96))+'px'
// draw.ts
export function drawRandomCards(cards: Card[], n: number, rng?: () => number): SpreadCard[];   // Fisher-Yates + nguoc only when nghia_nguoc non-blank
export function readDrawCount(raw: string): number;     // clamp 1..12, default 3
export function makeUid(): number;                      // module counter like uidCounter
export function toSpreadCard(c: SpreadCard): SpreadCard; // legacy field subset + new uid
// yesno.ts
export type YnClass = 'yes' | 'no' | 'maybe';
export function firstSentence(s: string): string;
export function localVerdict(c: Card, rev: boolean, lang: Lang): string;
export function ynClass(v: string): YnClass;
export function yesNoMessages(q: string, card: Card, rev: boolean, lang: Lang, cardEn: CardEnMap | null): ChatMessage[];
export function parseVerdict(answer: string): { verdict: string; body: string };
// journal.ts
export function orientLabel(c: Pick<SpreadCard,'orientation'>, lang: Lang): string;
export function readingHaystack(r: Reading): string;
export function exportStamp(d?: Date): string;
export function journalJson(readings: Reading[], dailyNotes: Record<string,string>, now?: Date): string;
export function journalMarkdown(readings: Reading[], dailyNotes: Record<string,string>, lang: Lang): string;
export function mergeImport(existing: Reading[], file: unknown): { add: Reading[]; notes: Record<string,string>; skipped: number };
// safeShare.ts
export function sanitizeShared(d: ShareData): ShareData;
// services/ai/chat.ts
export interface ChatResult { provider: ProviderId; free?: FreeAiInfo }
export async function chatComplete(...same args): Promise<ChatResult>;
```

- [ ] **Step 1: Write failing tests**, each against the legacy function through the harness where one exists:
  - `layoutGeom(SPREAD_LAYOUT.celtic)` deep-equals legacy `layoutGeom` output.
  - `freeLayout(7)` deep-equals the legacy output.
  - `SPREAD_UI` deep-equals the legacy object.
  - `drawRandomCards` with a seeded rng: same order and orientations as legacy `drawRandomCards` with `Math.random` stubbed to the same sequence. A card with a blank `nghia_nguoc` is never `nguoc`.
  - `readDrawCount`: `'0'→1`, `'99'→12`, `'x'→3`.
  - yes/no:
    - `localVerdict` and `ynClass` match legacy for upright, reversed and YN_MAYBE cards, in VI and EN.
    - `yesNoMessages` equals the legacy inline prompt messages byte for byte (VI and EN).
    - `parseVerdict('PHÁN QUYẾT: Có\nVì…')` returns `{verdict:'Có', body:'Vì…'}`.
  - journal:
    - `readingHaystack` equals legacy.
    - `journalMarkdown` equals legacy `exportJournalMarkdown` text (stub the download).
    - `journalJson` has `{app,kind,version:1,exportedAt,readings,dailyNotes}`.
    - `mergeImport` dedupes by `ts|question`, marks added records `imported:true`, returns only missing `dailyNote:*`, and rejects non-arrays without throwing.
  - `sanitizeShared`:
    - an `id:-1` card keeps `ten` verbatim (escaping happens at render);
    - drops `image_url` unless `new URL(u).protocol === 'https:'`;
    - clamps the cards array to 12.
  - `chatComplete` returns `{provider:'free', free:{model:'m', remaining:3}}` when `callFree` resolves that info, and `{provider:'gemini'}` otherwise.
- [ ] **Step 2:** Run `npx vitest run src/core src/services/ai` and expect FAIL.
- [ ] **Step 3:** Implement. Update the callers of `chatComplete` (`AiSettings` test-model path, if any) to read `.provider`.
- [ ] **Step 4:** Run `npm run check` and expect PASS.
- [ ] **Step 5:** Commit: `feat(core): spread geometry, draw, yes/no, journal and share-sanitize helpers; chatComplete reports free-AI info`.

### Task 2: Engines (audio sfx, zodiac wheel, shuffle loop, wheel pick, deal, burst)

**Files:** Create `src/engines/{audio,zodiacWheel,shuffle,wheel,deal,burst}.ts` + tests.

**Interfaces (Produces):**
```ts
// audio.ts — one shared AudioContext (Plan 2c ambient reuses getAudioCtx)
export function ensureAudio(): AudioContext | null;
export function getAudioCtx(): AudioContext | null;
export const sfx: { flick(t:number,pan:number,vol:number):void; whoosh(t:number,dur:number,vol:number):void; thump(t:number,vol:number):void;
  chime(t:number,idx:number,vol:number):void; tick():void; startTicks(dur?:number):void; stopTicks():void; stopAll():void };
export function setSfxEnabled(on: boolean, vol: number): void;   // store prefs.soundOn/soundVol drive this
// zodiacWheel.ts
export function zodiacWheelHTML(): string;                       // byte-equal legacy
// shuffle.ts
export function startShuffle(el: HTMLElement, deckSize: number): { stop(): void };   // N = clamp(deckSize, 8, 24) .riffle-card children + wheel
// wheel.ts
export interface WheelOpts { pool: SpreadCard[]; n: number; auto: boolean; lang: Lang; reduce: boolean;
  onStatus(text: string): void; onDone(cards: SpreadCard[]): void; reshufflePool(): SpreadCard[] }
export function startWheel(fan: HTMLElement, o: WheelOpts): { cancel(): void };
// deal.ts
export function dealBoard(board: HTMLElement, reduce: boolean, done: () => void): () => void;   // returns cancel
// burst.ts
export function burstAt(el: Element, n: number): void;
export function haptic(ms?: number): void;
```
Port the legacy bodies faithfully: same timings, keyframes, classes and status texts (L4759–4966, L5330–5478, L2767). Replace every `$()` lookup with the passed element. Every `setTimeout` and rAF is registered on a handle that `stop`/`cancel` clears; this replaces the legacy `live()` session checks. `sfx` is a no-op while disabled or before `ensureAudio()`.

- [ ] **Step 1: Write failing tests** (jsdom, fake timers, `Element.prototype.animate` stubbed to return a cancellable object):
  - `zodiacWheelHTML()` equals the legacy string.
  - `startShuffle(el, 78)` appends a `.zwheel` + 24 `.riffle-card`. After `stop()`, `vi.getTimerCount()` is 0 and further rAF callbacks change nothing.
  - `startWheel` manual:
    - builds one `.wcard` per pool card plus `.fan-reshuffle`;
    - after the double rAF, the fan has `.spread`;
    - clicking 3 cards calls `onDone` with those 3 pool cards in pick order after `700+1500+3*380+1300` ms;
    - the status texts equal legacy at 0/3 and 3/3 (VI and EN).
  - `startWheel` auto picks `n` cards without clicks. User clicks are ignored.
  - `cancel()` mid-reveal means `onDone` is never called and the timer count is 0.
  - `reduce: true` calls `onDone` within the same tick flush (`advanceTimersByTime(0)`).
  - `dealBoard`:
    - with reduce, every `.board-card.await` becomes `.revealed` and `done` runs at once;
    - without reduce, `done` runs after `(k-1)*STEP+560+700`;
    - the returned cancel prevents `done`.
- [ ] **Step 2:** Run and expect FAIL. **Step 3:** Implement. **Step 4:** Run `npm run check` and expect PASS.
- [ ] **Step 5:** Commit: `feat(engines): card sfx, shuffle loop, wheel pick and board deal as cancellable engines`.

### Task 3: Shared spread components (SpreadPicker, SpreadBoard)

**Files:** Create `src/components/spread/{SpreadPicker,SpreadBoard}.tsx` + `spread.test.tsx`.

**Interfaces:**
- Consumes: Task 1 `SPREAD_UI`, `layoutGeom`, `freeLayout`, `boardWidth`; Plan 1 `SPREADS`, `SPREAD_LAYOUT`, `defsFor`; Task 2 `dealBoard`, `burstAt`, `haptic`.
- Produces:
```tsx
<SpreadPicker value={key} onChange={(k: string) => void} />       // #spreadPicker markup + .picker-wrap nav; id prop optional (default 'spreadPicker')
export interface SpreadBoardHandle { deal(): Promise<void> }       // resolves when the last card is revealed; cancelled on unmount
<SpreadBoard ref spreadKey cards={SpreadCard[]} positions={string[]|null} mode={'deal'|'shown'} id?="spreadBoard" />
```
Markup follows legacy `renderSpreadPicker` (L2711) and `renderBoard` (L2733). Clicking a board card reveals an unrevealed card (haptic + burst), or opens the store lightbox if it is revealed (reversed → flip). The picker scrolls the selected tile into view on mount and on change, and syncs the ‹/› disabled state and `.more-left/.more-right` on scroll and resize.

- [ ] **Step 1: Write failing tests:**
  - SpreadPicker innerHTML equals legacy `renderSpreadPicker` output for `spreadKey='celtic'`, VI and EN (harness, style attributes normalised as in the Daily test).
  - Clicking a tile calls `onChange('ppf')`. Clicking the selected tile does nothing.
  - The ‹ button calls `scrollBy` with `-0.8 * clientWidth`.
  - SpreadBoard innerHTML equals legacy `renderBoard('')` for a 3-card `ppf` spread, and for a 7-card free spread with `mode='deal'` (cards `.await`).
  - Clicking a revealed card with an image opens the lightbox.
  - `deal()` resolves (fake timers), and unmounting mid-deal leaves no timers.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(spread): shared spread picker and board components`.

### Task 4: DrawStage + ritual + one-draw-at-a-time

**Files:** Create `src/components/spread/{DrawStage,RitualOverlay}.tsx`, `src/components/spread/drawSession.ts` + `drawStage.test.tsx`. Modify `src/app/store.ts` (ritual request) and `src/app/routes.tsx` (mount `<RitualOverlay/>`).

**Interfaces:**
```ts
// drawSession.ts — module singleton replacing legacy DRAW_CTX sessions
export function claimDraw(owner: 'draw' | 'reading', cancel: () => void): number;   // cancels the previous owner's run, returns token
export function isLive(token: number): boolean;
export function releaseDraw(token: number): void;
// store.ts
ritual: { question: string; start(): void } | null;   requestRitual(r): void; closeRitual(): void;
```
```tsx
<DrawStage ctx="draw"|"reading" count={number} question={string}
  onStart={() => void} onPicked={(cards: SpreadCard[]) => void} doneMsg={(k: number) => string} />
```
DrawStage renders:
- the two draw buttons with the **§5.8 labels and hint lines**, for both ctxs. New dictionary keys:
  - `draw.auto` = "🎲 Máy bốc ngẫu nhiên" / "🎲 Draw for me", hint `draw.auto.hint` = "Máy xào rồi tự rút giúp bạn." / "The deck shuffles and draws for you.";
  - `draw.manual` = "✋ Tự tay chọn lá" / "✋ Pick my own cards", hint `draw.manual.hint` = "Xào xong, bạn bấm chọn từng lá trên bánh xe." / "After the shuffle, tap each card on the wheel.";
- the stop button;
- the orbit stage `#drawOrbit|#spreadOrbit`, status `#pickStatus|#spreadPickStatus` and fan `#drawFan|#spreadFan`, with legacy ids per ctx.

Flow, as legacy `beginDraw → startOrbit → stopOrbit → startManualPick`:
- If the ritual is not off, it goes through the store ritual overlay first.
- `claimDraw`, then `onStart`.
- Shuffle, unless reduced motion.
- On Stop, run the wheel (`auto` for 🎲, manual for ✋). The pool comes from `drawRandomCards(db.query({deck}), db.count(deck) || 78)`.
- Then `onPicked`.

Other behaviour:
- **§5.8 scroll:** when the shuffle starts, scroll the orbit stage into view (`block:'center'`, `behavior` auto under reduced motion).
- Unmount cancels the run.
- The buttons are disabled while shuffling.
- Sound follows `prefs.soundOn` / `prefs.soundVol` via `setSfxEnabled`.
- RitualOverlay ports L841–848. "Bắt đầu" persists "don't show again" through `setPref('ritualOff', true)`.

- [ ] **Step 1: Write failing tests:**
  - **Ritual:** with ritual on, clicking 🎲 opens `#ritualOverlay` with the question quoted ("“q”"). Start → `.riffle.on`. With the "don't show again" checkbox ticked, `localStorage.tarotRitual === '0'`.
  - **Pick flow:** ritual off and reduced motion stubbed → clicking ✋ shows the fan. Clicking 3 `.wcard` calls `onPicked` with 3 cards. Status equals `doneMsg(3)`.
  - **Review Focus 1:**
    - render two DrawStages (`draw` and `reading`); start `draw`, then start `reading`;
    - `draw`'s orbit is reset;
    - its `onPicked` is never called after advancing all timers;
    - unmounting `reading` mid-wheel leaves `vi.getTimerCount() === 0`.
  - **Button labels:** EN shows "🎲 Draw for me" and "✋ Pick my own cards", each with its hint line.
  - **Scroll:** `scrollIntoView` is called on the orbit when the shuffle starts.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(draw): shared DrawStage with ritual, shuffle, wheel and single active draw`.

### Task 5: Draw tab (§5.8)

**Files:** Create `src/features/draw/Draw.tsx` + `draw.test.tsx`. Modify `src/app/routes.tsx` (`draw: <Draw/>`). Uses `useReading.drawSpreadKey` / `drawResult` (defined in Task 6, which runs first).

Layout, top to bottom:
- `#moonBadge` (legacy `renderMoon`, VI text) and `#drawInfo` (legacy `updateDrawInfo` text).
- `<SpreadPicker id="drawSpreadPicker">`. "Tự do" shows the legacy "Số lá:" field `#drawCount`; a fixed spread hides it and uses the position count.
- `<DrawStage ctx="draw">`, plus `#soundToggle` (L4745: opacity .45 + line-through when off) and `#drawToReading`.
- `<SpreadBoard id="drawBoard">`. After the pick:
  - +1600 ms (0 under reduce): hide the fan, scroll the board into view (§5.8.3);
  - then `deal()`.
- `#drawResults`, appearing after the deal. Each `.draw-card.revealed` uses the legacy `drawCardInner` markup, with the position name prepended to the number when the spread has positions ("1. Quá khứ — The Fool").

"Đưa sang Trải bài AI" sets the reading spread type to `drawSpreadKey` and the reading cards to `drawResult.map(toSpreadCard)`, navigates to `/trai-bai`, and the reading list reveals in sequence (legacy `renderSpread(true)`).

- [ ] **Step 1: Write failing tests:**
  - With the `ppf` spread picked and reduced motion, clicking ✋ and picking 3 cards gives 3 board cards and 3 `.draw-card` whose names start with "1. Quá khứ", "2. Hiện tại", "3. Tương lai".
  - `#drawToReading` stays disabled until the deal finishes. Clicking it navigates to `/trai-bai` with the reading store holding `spreadKey='ppf'` and the 3 cards (new uids).
  - "Tự do" with `#drawCount` = 5 draws 5. Fixed spreads hide `#drawCount`.
  - The sound toggle flips `prefs.soundOn` and the legacy style.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS. Update `docs/superpowers/plans/plan-2a-parity.md` to note that `/boc-bai` is intentionally different (spec §5.8).
- [ ] **Step 5:** Commit: `feat(draw): Draw tab with spread picker, numbered board and dealt meanings (spec 5.8)`.

### Task 6: Reading store + steps panel (question, spread type, draw, manual add, list, facts)

**Files:** Create `src/features/reading/{readingStore,Reading,Steps,SpreadList}.tsx|ts` + `reading.test.tsx`. Modify `routes.tsx` (`reading: <Reading/>`).

**Interfaces (Produces):**
```ts
export interface ReadingState {
  question: string; spreadKey: string; cards: SpreadCard[]; reveal: 'none' | 'seq' | 'deal';
  answer: string; provider: string | null; messages: ChatMessage[]; followups: { q: string; a: string }[];
  current: Reading | null; aiBg: 'off' | 'thinking' | 'done';
  drawSpreadKey: string; drawResult: SpreadCard[];
  setQuestion(q: string): void; setSpreadKey(k: string): void; setCards(c: SpreadCard[], reveal?: ReadingState['reveal']): void;
  addCard(c: Card): boolean; removeCard(uid: number): void; setOrientation(uid: number, o: Orientation): void; clear(): void;
}
export const useReading: UseBoundStore<StoreApi<ReadingState>>;
export function positionsFor(state: Pick<ReadingState,'spreadKey'>, lang: Lang): string[] | null;  // defsFor
```
Steps port markup L985–1048. Behaviour:
- **Question:** the chips fill the question in the current language (`data-q`/`data-qen`). `ReadingEntryState.question` from Landing pre-fills it.
- **`autoPick`:** when true, focus the manual-pick button (legacy `go()` L2090: check the exact legacy behaviour and match it).
- **Picker and deck:**
  - `SpreadPicker` sets `spreadKey`;
  - fixed spreads lock `#spreadDrawCount` to the position count;
  - `#spreadHint` is the legacy `updateSpreadHint` markup;
  - `#deckSelectReading` is a `DeckSelect` (Plan 2a).
- **Draw:** `<DrawStage ctx="reading">`, then `setCards(cards,'deal')`. After 1600 ms (0 under reduce), hide the fan, scroll the board (or the list) into view, then `deal()`, then remove `#spreadList.pending`. Matches L4789.
- **Manual add:**
  - `#pickerInput` uses `createCardSearch(db.query({deck}))` with limit 8 and keyboard ↑/↓/Enter/Esc (ignore `isComposing`);
  - `.dup` marks a card that is already in the spread;
  - adding refuses beyond a fixed spread's size, then clears and refocuses (L2918–2960).
- **SpreadList:** `.spread-item` rows as in L2969: thumb flip, position badge with the `posDesc` title, name, suit, `CorrChips`, Xuôi/Ngược toggle, ✕.
- **Facts:** `#spreadFacts` shows `factLines` when there are ≥2 cards, using the major-name lookup from Global Constraints.
- **Actions:** `#interpretBtn` and `#clearSpreadBtn` are disabled when the spread is empty.
- **`#cloudNote`:** the legacy `renderCloudNote` text, with links toggling `prefs.cloudSave`.
- **`#readingDeckInfo`:** legacy `updateReadingDeckInfo` (hidden attribute as legacy).

- [ ] **Step 1: Write failing tests:**
  - The steps markup matches legacy by ids, classes and labels in order (the AiSettings-test approach).
  - Choosing `celtic` disables `#spreadDrawCount` with value 10.
  - Manual add: typing "fool" lists results. Enter adds the active one. On `one`, a second add is refused.
  - Toggling Ngược updates the store. ✕ removes the card.
  - The facts box appears at 2 cards with the legacy `factLines` text.
  - Landing entry `{question:'Q', autoPick:true}` pre-fills `#questionInput`.
  - **Review Focus 5:** switching the language re-renders the spread rows' position labels, the picker and the facts in EN.
  - State survives navigating to `/tra-cuu` and back.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(reading): reading store and steps panel (question, spread type, draw, manual add, list, facts)`.

### Task 7: Interpret, stream, follow-up, save, note, TTS, floating cards

**Files:** Create `src/features/reading/{ResultPanel,AiStream}.tsx`, `src/features/reading/{interpret,aiCardsBg}.ts` + `interpret.test.tsx`.

**Interfaces:**
```ts
export interface StreamView { status: 'connecting' | 'thinking' | 'streaming' | 'done' | 'error' | 'empty'; text: string; reasoning: string; switched: boolean; error?: string }
export function runInterpret(deps: { chat?: typeof chatComplete; save?: typeof addReading; cloud?: typeof cloudSaveReading }): Promise<void>;
export function runFollowUp(q: string, deps?: …): Promise<void>;
export function startAiCardsBg(box: HTMLElement, cards: SpreadCard[], reduce: boolean): { mode(m: 'thinking' | 'done'): void; stop(): void };
```
Port L3669–3855 and L4236–4373:
- **Messages:** `[system(buildSystemPrompt), user(buildUserPrompt)]`.
- **During the stream:**
  - the spinner shows "Đang kết nối…";
  - reasoning shows live as `.thinking`, then collapses into `<details class="think-box">`;
  - markdown is rendered with `renderMarkdown` via `dangerouslySetInnerHTML` (the renderer escapes);
  - `onSwitch` shows the `.fallback-note`.
- **Saving the reading:**
  - `addReading` with the legacy record shape;
  - `cloudSaveReading` only when `prefs.cloudSave`;
  - `provider` label from `providerLabel(result.provider, settings, lang, result.free)`.
- **Result panel:**
  - `#aiQuota` from `result.free.remaining`;
  - `#resultPanel.is-empty` until there is output;
  - rAF-scroll to `#resultPanel` when interpret starts;
  - `#readingNote` saves through a 500 ms debounce to `updateReading`, with the legacy status text.
- **Follow-up:**
  - appends `.chat-q` ("☌︎ q") and `.chat-a`;
  - on success, pushes `{q,a}` to `followups` and calls `updateReading`;
  - on failure, pops the user message;
  - Enter sends, Shift+Enter inserts a newline.
- **TTS (`#ttsBtn`):** `speechSynthesis` with `vi-VN`; clicking again cancels.
- **Floating cards (`#aiCardsBg`):** follow `aiBg` mode; stopped on unmount.

- [ ] **Step 1: Write failing tests** (fake `chat` dep, fake-indexeddb):
  - Interpret streams "Xin" + " chào" into `#aiOutput` as markdown. The record saved in IDB has the legacy shape (question, cards subset, `positions`, `facts`, `spread`, `provider`).
  - **Review Focus 3:**
    - the chat calls `onSwitch` and then streams: `.fallback-note` shows and the answer is saved;
    - the chat throws after a token: the "⚠️ Lỗi:" message shows, nothing is saved, and `#interpretBtn` is enabled again.
  - `free` result with `remaining: 4`: `#aiQuota` reads "Còn 4 lượt miễn phí hôm nay", and the saved provider is "AI miễn phí · m · còn 4 lượt hôm nay".
  - The follow-up appends the Q/A and the IDB record gains `followups:[{q,a}]`.
  - Note typing saves after 500 ms.
  - `cloudSaveReading` is not called when `prefs.cloudSave` is false.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(reading): AI interpret with streaming, fallback, follow-ups, journal save, note and TTS`.

### Task 8: Share link, share image, loadReading, `#r=` deep link

**Files:** Create `src/features/reading/share.ts` + `share.test.tsx`. Modify `Reading.tsx` (hash handling), `ResultPanel.tsx` (buttons).

**Interfaces:**
```ts
export function loadReading(r: Reading | ShareData-derived Reading): void;   // L4314 into useReading + deck switch + navigate
export async function shareReadingLink(): Promise<void>;                     // L4056 (navigator.share on touch, clipboard, prompt fallback; "✅ Đã copy link" 2 s)
export async function exportReadingImage(): Promise<void>;                   // L3857–4004 canvas → PNG (proxiedImg via /api/img for tarot.vn only)
```
On mount, `Reading` reads `location.hash`. If it is `#r=…`:
- `decodeShare`;
- then `sanitizeShared` (Task 1);
- then map cards: ids resolve through `db.byId`; `id:-1` cards use the shared fields;
- then `loadReading`;
- then clear the hash with `history.replaceState`, as legacy does in `loadSharedFromHash` (L4072). Match its exact behaviour, including the error message for a bad link.

`loadReading`:
- restores the question, spread type and cards (new uids);
- switches deck when the reading uses a single known deck;
- renders the answer;
- resets the chat;
- sets `current` (null for share links);
- shows the note;
- scrolls to the top.

- [ ] **Step 1: Write failing tests:**
  - A link string produced by the **legacy** `encodeShare` in the harness, for a ppf spread with one reversed card, loads into the store with the same question, spread key, card ids, orientations and answer.
  - `shareReadingLink` writes `location.origin + '/#r=' + encodeShare(buildShareData(...))` to the clipboard (stubbed), and the button text becomes "✅ Đã copy link".
  - **Review Focus 2:** a hostile `id:-1` card renders its `ten` as text (no `img` element is created from it) and has no `image_url`.
  - A bad `#r=garbage` shows the legacy error text and leaves the reading empty.
  - `exportReadingImage` with the canvas stubbed calls `toBlob` and builds the legacy file name.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(reading): share link, share image and #r= deep links (sanitized)`.

### Task 9: History

**Files:** Create `src/features/history/{History,HistoryItem}.tsx` + `history.test.tsx`. Modify `routes.tsx`.

Port markup L1077–1092 and `renderHistory` L4380:
- **List:** newest first; `#histSearch` is debounced 200 ms over `readingHaystack`.
- **Clear:** `#clearHistory` is hidden when the list is empty. Clicking it asks `confirm()`, then `clearReadings`, and resets `useReading.current` if needed.
- **Items:**
  - Xem/Ẩn toggles `.hist-detail.open`;
  - Tải lại → `loadReading(it)` (Task 8);
  - ✕ asks `confirm()`, then `deleteReading`;
  - the detail note saves through a debounce to `updateReading`.
- **Export:** JSON or Markdown via `journalJson` / `journalMarkdown` and a download link (`tarot-journal-<exportStamp>.json|md`).
- **Import:** `#journalImportFile` → `mergeImport` → `addReading` for each new record, then write the missing daily notes, then `alert()` the legacy summary text.

- [ ] **Step 1: Write failing tests** (fake-indexeddb):
  - **Rendering:**
    - 3 seeded readings render newest first with the legacy `.hist-item` structure;
    - one legacy record without `followups`, `facts`, `positions` or `spread` renders (Review Focus 4);
    - the search "tower" filters after 200 ms.
  - **Actions:**
    - Reload navigates to `/trai-bai` with the reading loaded;
    - delete (confirm stubbed true) removes the record.
  - **Import and export:**
    - import of a file with one duplicate and one new record adds 1, marks it `imported:true` and alerts the legacy summary;
    - `cloudSaveReading` is never called for imported records;
    - export JSON produces a Blob whose parsed `version` is 1.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(history): journal list, search, reload, delete, notes, export and import`.

### Task 10: Yes/No

**Files:** Create `src/features/yesno/YesNo.tsx` + `yesno.test.tsx`. Modify `routes.tsx`.

Port markup L1106–1123 and `drawYesno` L2178:
- Draw one random card and orientation (50%, only reversed if the card has a reversed meaning: check the legacy rule).
- On draw: haptic, `ensureAudio`, `sfx.tick()`, burst.
- **Result:** `#ynVerdict`, an image (lightbox on click, rotated when reversed), `.yn-card-name` and `#ynWhy`.
- **With AI configured** (`providerChain` non-empty and ready: legacy `aiConfigured()`):
  - show "…" plus the spinner;
  - `chatComplete(yesNoMessages(...))`, then `parseVerdict`, then `ynClass` → verdict class, with the body as markdown;
  - on error, fall back to `localVerdict` and `firstSentence(meaning)`.
- The chips fill and focus `#yesnoQ`. Enter in `#yesnoQ` draws.

- [ ] **Step 1: Write failing tests:**
  - With AI not configured and rng stubbed, the result shows the local verdict for an upright card ("Có"), and the "why" equals `firstSentence(meaning)`.
  - With AI (fake chat returning "PHÁN QUYẾT: Không\nVì…"), the verdict reads "Không", has class `no`, and the body is rendered.
  - When the chat throws, the local verdict shows.
  - Clicking a chip fills the question in the current language.
- [ ] **Steps 2–4:** FAIL → implement → `npm run check` PASS.
- [ ] **Step 5:** Commit: `feat(yesno): yes/no card with AI verdict and local fallback`.

### Task 11: Parity check, review, wrap-up

- [ ] **Step 1:** Extend `scripts/parity-screens.mjs` with Reading (empty, plus a 3-card ppf spread added via the manual search), History (empty), and Yes/No (empty). Run it.
  - Draw is skipped, since it is intentionally different.
  - Fix real gaps; record the noise in `docs/superpowers/plans/plan-2b-parity.md`.
- [ ] **Step 2:** Run the dev server and check these by hand (or with Playwright) against the fixture DB:
  - draw → board → send to reading → interpret (free endpoint stubbed by the dev proxy, or a BYOK key if available) → share link → open it in a new tab;
  - history reload;
  - yes/no.
- [ ] **Step 3:** Whole-branch review (opus) of Plan 2b, then fix the findings with tests.
- [ ] **Step 4:** Update the ledger and memory. Commit: `docs: Plan 2b parity report`.

**Order:** 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9 → 10 → 11. Task 6 comes before Task 5 because Draw hands off into the reading store.
