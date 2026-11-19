# Legacy UI inventory — `witches_tarot.html` (5,902 lines)

Source: `D:\TrungTruong\Tarot\witches_tarot.html`. `L` = line number. Already-ported logic is referenced by name only.
Layout of the file: `<head>`/meta/JSON-LD L1–45 · CSS L46–828 · body HTML L830–1341 · sql.js CDN L1344 · main script L1345–5893 · Vercel scripts L5897/L5900.

Conventions used everywhere: `$ = id => getElementById(id)` (L1347). Views are shown/hidden with inline `style.display`. Modals open with class `.open`. Overlays use `style.display:flex`.

---

## 1. Screens / views

### 1.0 App shell (always present)
| Element | L | Notes |
|---|---|---|
| `svg` icon sprite (`symbol#i-*`) | 832 | 20 symbols, see §7 |
| inline theme bootstrap `<script>` | 833 | §7 |
| `#bgAura` (div), `#bgStars` (canvas) | 834–835 | background engine §4.6 |
| `#ritualOverlay` | 838–850 | pre-draw ritual (part of draw engine §4.5) |
| `#landing` | 852–907 | full-screen fixed overlay, z-index 100 |
| `#navToggle` (hamburger), `#navScrim` | 909–910 | `navToggle` hidden until `enterApp()` |
| `#appPage` | 912–1153 | hidden (`display:none`) until `enterApp()` |
| `#appPage > header` (logo, `.brand-name` h2, tagline `data-i18n="tagline"`) | 913–919 | |
| `#navMenu` | 921–934 | drawer (<1024px) / dome bar (≥1024px) |
| `#deckBar` > `#deckSelect` | 936–939 | shown at boot (`display:flex`, L5514); hidden by CSS in browse/reading (L531) |
| `#bootStatus` | 941 | "Đang tải cơ sở dữ liệu SQLite…" → hidden on boot success; error text on failure |
| 7 view roots `#browseView #drawView #readingView #historyView #dailyView #yesnoView #skyView` | 944–1152 | |
| `#settingsOverlay` (AI settings) | 1156–1265 | |
| `#siteOverlay` (site settings) | 1268–1337 | |
| `#imgLightbox` > `#lightboxImg` | 1341 | shared lightbox |

Shared helpers used by many views: `openLightbox(url, reversed)` L5491 (click lightbox → close, L5498; no Esc). `haptic(ms)` L4128 (`navigator.vibrate`). `burstAt(el,n)` L2118 → `window.tarotBurst`. `corrChips(card)` L1558 (element/numerology/astro chip HTML; astro only in VI). `drawCardInner(c,i)` L4581 (flip card + meta HTML). `prefersReduced()` L4593 / `reduceMotion()` L1967 (duplicate helpers). `t(key, fallback)` L1395.

---

### 1.1 Landing (`#landing`, L852–907; JS `initLanding` IIFE L2019–2098, `enterApp` L1968, `goLanding` L1977)
**Key child ids:** `landingEnter` (brand button), `.lt-nav [data-go]` ×6 (reading/draw/daily/yesno/browse/sky), `landingBurger`, `landingMoon`, `askForm`, `askInput` (maxlength 300), `askErr`, `askCount`, `askGo` (submit), `askSkip`, `.lt-seo` (static SEO + FAQ `<details>`, L885–901), `.lt-deco` > `.lt-circles`, `.lt-orb`, `#landingFan`.

| Event | Handler | Effect |
|---|---|---|
| `#landingEnter` click | L1989 inline | if `dbReady` → `enterApp()`; else disable btn, spinner + "Đang chuẩn bị bầu trời…/Preparing the sky…", `whenReady(() => restore label; enterApp())`. Enters on whatever mode boot set (= `daily`). |
| `.lt-nav [data-go]` click | L2054 | `whenReady(() => { enterApp(); switchMode(b.dataset.go) })` |
| `#landingBurger` click | L2057 | `whenReady(() => { enterApp(); openNav() })` |
| `#askInput` input | L2067 | update `#askCount` "n/300", toggle `.show` when >0, hide `#askErr` |
| `#askForm` submit | L2086 | empty → show `#askErr`, restart `.shake` anim on form, focus input, hide err after 2600ms. Else `go(q)` |
| `#askSkip` click | L2097 | `go('')` |
| `go(q)` | L2073 | `whenReady`: `enterApp()`; `switchMode('reading')`; set `#questionInput.value=q` and dispatch `input` (no listener exists — no-op); reset ask input/count; after **380ms** scroll `#spreadPickBtn` into view (center) and `.click()` it → opens ritual / wheel pick in reading |
| window resize | L2052 | debounced 150ms → `layoutLandingFan()` |
| `document.fonts.ready` | L2050 | `layoutLandingFan()` |

**Reads:** `dbReady`, `lang`. **Writes:** none global. **localStorage:** none (theme/lang only indirectly).
**Hands off to:** any mode via `.lt-nav`; reading (+auto wheel pick) via ask form; drawer via burger. `goHome` (nav) returns here.
**Notable behaviour:**
- `layoutLandingFan()` L2025: builds N=15–41 `.lc` cards in `#landingFan` with `--a` angle and `--dl` delay; sets `--cw`, `--R` from `innerWidth`; next rAF measures `#askSkip` bottom and sets `--drop` so the fan does not overlap the buttons.
- Rotating placeholder tips (5 VI / 5 EN) `setInterval` **3800ms**, paused while the input is focused or non-empty (L2066). **Never cleared.**
- `enterApp()` L1968: shows `#appPage` with `.page-in` fade (reflow trick), shows `#navToggle`, plays `landOut .34s` on landing then adds `.hide` after 320ms (instant when reduced motion).
- `goLanding()` L1977: `closeNav()`, hides `#appPage` + `#navToggle`, removes `.hide`, replays `landFade`, `renderMoon()`, `scrollTo(0)`.
- `#landingMoon` filled by `renderMoon()` (L5098): `moonSvg(frac,'moon-svg sm')` + "phase · N% sáng" (VI only).
- CSS animations: emblem dashed ring spin, `.lt-stars` float, orb breathe, circles spin, fan sway (`lcSway`), CTA hover fill.
- `.lt-seo` hidden when `<html lang="en">` (CSS L162). The FAQ must stay in sync with JSON-LD L21–34.

---

### 1.2 Browse (`#browseView`, L944–961; JS L1726–1874)
**Key ids:** `deckSelectBrowse`, `searchInput`, `clearButton`, `categoryTabs` (suit tiles, built in JS), `browsePagesLink`, `cardsList`, `noResults`, `cardDetails`.

| Event | Handler | Effect |
|---|---|---|
| `#searchInput` input | `updateFilter` L1786 | `queryCards(selectedCategory,q)`; when q is set, prepend `searchCards(q,78)` smart matches (filtered by category), dedupe → `renderList` |
| `#clearButton` click | L1874 | clear search, `updateFilter()`, focus search |
| suit tile click | `renderCategoryTabs` L1855 | `selectedCategory=cat`, toggle `.active`/`aria-pressed`, `loadSuitFan`, clear search, `updateFilter()` |
| suit tile mouseenter/focus (once) | `loadSuitFan` L1827 | swap `data-src`→`src` on the two side images (lazy) |
| `.card-item` click | `selectCard(card,item,true)` L1762 | render detail; on ≤980px `detailsEl.scrollIntoView({smooth})` |
| `#browsePagesLink` click/focus/pointerenter/contextmenu | `syncPagesLink` L1759 | href = `/la-bai/<deck-slug>/` or `/la-bai/` |
| `#deckSelectBrowse` change | `setDeck` L4155 | shared deck change (§2) |

**Render functions:** `renderList` L1735 (auto-selects first card; empty → `#noResults` + placeholder detail "Chưa chọn lá bài" VI-only). `selectCard` L1762: image, number badge, suit, SEO card link (`seoCardPath` L1751, only for Witches/Rider-Waite), source link, `corrChips`; VI-only sections Chiêm tinh học / Thần thánh / Mô tả hình ảnh / Nội dung đầy đủ; translated sections Keywords/Upright/Reversed via `cardText` + `t()`. `renderCategoryTabs` L1830: "all" tile + one per `bo` (`boCounts`, `suitTopCards`, `deckTotal` SQL), 5 `.st-layer` + 3 `.st-card` with random jitter `--j`; labels from `SUIT_META` (VI/EN).
**Reads:** `db`, `selectedDeck`, `selectedCategory`, `lang`, `CARD_EN`. **Writes:** `selectedCategory`.
**Hands off:** none (external SEO pages in new tab).
**Notable:** 3D suit-tile CSS (L251–287); horizontal scroll-snap row ≤760px; tilt on `.card-image` (§4.8). **`renderCategoryTabs` is not re-run on language change** (tile labels stay in the old language until a deck change).

---

### 1.3 Draw (`#drawView`, L964–982; JS L4554–4593, engine §4.5)
**Key ids:** `moonBadge`, `drawInfo`, `drawCount` (number 1–12, default 3), `drawBtn`, `pickBtn`, `stopShuffle`, `soundToggle`, `drawToReading` (disabled initially), `drawOrbit` (`.riffle`), `pickStatus`, `drawFan` (`.fan`), `drawResults`.

| Event | Handler | Effect |
|---|---|---|
| `#drawBtn` click | `beginDraw('draw')` L5327 | ritual (if enabled) → shuffle → auto-pick wheel |
| `#pickBtn` click | `beginDraw('pick')` L5479 | ritual → shuffle → manual-pick wheel |
| `#stopShuffle` click | `stopOrbit` L5328 | stop shuffle → `finishOrbit(orbitMode)` → wheel |
| `#soundToggle` click | `setSoundOn(!soundOn)` L4755 | toggles sfx; style opacity .45 + line-through when off; syncs `#siteSound` |
| `.wcard` click (in `#drawFan`) | `onPick` (closure in `startManualPick`) | pick card (manual mode only) |
| `.fan-reshuffle` click | L5460 | reshuffle wheel (only before first pick) |
| `#drawToReading` click | L5480 | `spread = lastDraw.map(toSpreadCard)`; `switchMode('reading')`; `renderSpread(true)` (sequential flip reveal in list); `scrollTo top smooth` |

**`DRAW_CTX.draw`** L4763: `onStart` clears `#drawResults`, disables `#drawToReading`, `lastDraw=[]`. `onPicked(cards)` sets `lastDraw`, appends `.draw-card.revealed(.dealt)` with stagger `animationDelay j*90ms`, enables `#drawToReading`. `doneMsg(k)`.
**Reads:** `selectedDeck`, `soundOn`, `ritualDone`, `lang`. **Writes:** `lastDraw`, `soundOn` (+ `tarotSound`), `drawCtx`, `orbitMode`, `shuffleLoop`.
**Hands off:** reading (`#drawToReading` "Send to AI Reading").
**Notable:** `#moonBadge` from `renderMoon()` (VI text only). `updateDrawInfo()` L4571 text. Draw-card images are not lightbox-clickable (tilt only). The "Số lá:" label has no id/i18n (EN key `draw.count` is defined but never wired).

---

### 1.4 Reading (`#readingView`, L985–1075; JS L2529–3022, L3702–3855, L4006–4127, L4236–4373)
**Key ids:**
- Steps panel `.reading-steps`: `readingDeckInfo` (hidden attr), step 1 `questionInput` + `.q-chips .qchip[data-q][data-qen]` ×5; step 2 `.picker-nav.prev/.next[data-dir]`, `spreadPicker` (role=radiogroup, tiles built in JS), hidden `spreadType` `<select>` (value source + `change` event), `spreadHint`; step 3 `deckSelectReading`, `spreadDrawCount`, `spreadDrawBtn`, `spreadPickBtn`, `spreadStopShuffle`, `spreadOrbit`, `spreadPickStatus`, `spreadFan`, `<details.manual-add>` > `pickerInput`, `pickerResults`; step 4 `spreadBoard`, `spreadList`, `spreadFacts` (details: summary + `.facts-body`), `interpretBtn`, `clearSpreadBtn`, `cloudNote`.
- Result panel `resultPanel` (`.is-empty` until content): `aiSection` > `aiCardsBg`, `readingProvider` (h3), `aiQuota`, `ttsBtn`, `shareImgBtn`, `shareLinkBtn`, `aiOutput`, `chatFollow` > `chatLog`, `chatInput`, `chatSend`; `readingNoteWrap` > `readingNote`, `readingNoteStatus`.

| Event | Handler | Effect |
|---|---|---|
| `.qchip` click (reading) | L4110 | `questionInput.value = dataset.q`; focus |
| `.picker-nav` click | L2703 | `spreadPicker.scrollBy(±0.8·width)` |
| `#spreadPicker` scroll, window resize | `syncPickerNav` L2692 | disable ‹/›, toggle `.more-left/.more-right` fade edges |
| `.sp-tile` click | `renderSpreadPicker` L2722 | set hidden `#spreadType` value, dispatch `change` |
| `#spreadType` change | `applySpreadType(v)` L2793 | `spreadKey`, `spreadPositions=defsFor(v)`; fixed spreads lock `#spreadDrawCount` to position count; `updateSpreadHint`, `renderSpreadPicker`, `renderSpread` |
| `#deckSelectReading` change | `setDeck` | §2 |
| `#spreadDrawBtn` / `#spreadPickBtn` | `beginDraw('draw'|'pick','reading')` L5488–5489 | engine §4.5, ctx `reading` |
| `#spreadStopShuffle` | `stopOrbit` L5490 | |
| `#pickerInput` input | `renderPicker` L2918 | `searchCards(q,8)` → `.picker-item` buttons (marks `.dup` if already in spread); empty → hint text |
| `#pickerInput` keydown | L3015 | ↑/↓ `setPickerActive`, Enter clicks active item (ignores IME `isComposing`), Esc clears |
| `.picker-item` click / mouseenter | L2937–2938 | `addToSpread(card)` (refuses beyond fixed spread size; clears + refocuses input) / set active |
| `.board-card` click (`#spreadBoard`) | `renderBoard` L2759 | unrevealed → reveal + haptic + burst; revealed → lightbox |
| `.orient button` click | `renderSpread` L2991 | `c.orientation = 'xuoi'|'nguoc'`; re-render |
| `.rm` click | L2994 | remove by `uid` |
| `.spread-flip` click (list thumb) | L2998 | reveal, or lightbox |
| `#clearSpreadBtn` | L3022 | `spread=[]`, `renderSpread()`, `aiBgMode('off')` |
| `#interpretBtn` | `interpret` L3774 | see below |
| `#chatSend` click / `#chatInput` Enter (no Shift) | `sendFollow` L3822 | follow-up Q&A |
| `#ttsBtn` | `speakReading` L4115 | Web Speech; toggles cancel if speaking; always `vi-VN` voice |
| `#shareImgBtn` | `exportReadingImage` L3879 | §4.9 |
| `#shareLinkBtn` | `shareReadingLink` L4056 | `#r=` + `encodeShare(buildShareData())`; touch → `navigator.share`; else clipboard, button text "✅ Đã copy link" 2s; fallback `prompt()` |
| `#cloudNote [data-cloud-off]/[data-cloud-on]` click | `initCloudSave` L2014 | `setCloudSave(bool)` |
| `#readingNote` input | L4371 | `saveNoteDebounced(currentReading, …)` 500ms → `idbUpdateReading` |

**`interpret()` L3774 flow:** disable btn; hide/clear chat; `currentReading=null`; hide note; hide TTS; cancel speech; `chatMessages=[system(buildSystemPrompt), user(buildUserPrompt)]`; `aiBgMode('thinking')`; un-hide result panel; rAF scroll to `#resultPanel`; `streamInto(aiOutput, chatMessages)`; on answer: `updateProviderLabel(lastProviderUsed)`, push assistant msg, `await saveReading(answer)` (IndexedDB + `cloudSaveReading`), `showReadingNote`, show `#chatFollow`, TTS, share img, share link; `lastAnswerText=answer`. Error: `.ai-hint` + "⚠️ Lỗi: …" (+ model-not-found advice, VI only) and keep `.fallback-note`. Finally: re-enable btn, `aiBgMode('done')`.
**`streamInto(targetEl, messages)` L3669 (UI wrapper around `chatComplete`, not ported):** spinner "Đang kết nối…"; reasoning shown live as `.thinking` until the first token, then collapsed into `<details.think-box>`; markdown re-rendered on every token (`innerHTML` rewrite); `onSwitch` shows `.fallback-note` "AI đang bận — đang chuyển sang máy dự phòng…"; empty result → `.ai-hint` message. VI-only strings: "Đang kết nối…", "Đang suy nghĩ…", "Quá trình suy nghĩ của AI", empty messages.
**`sendFollow()` L3822:** appends `.chat-q` ("☌︎ q") + `.chat-a.ai-output` into `#chatLog`; push user msg; `aiBgMode('thinking')`; stream; on success push assistant msg and append `{q,a}` to `currentReading.followups` → `idbUpdateReading`; on fail pop msg; finally `aiBgMode('done')`, re-enable, `aDiv.scrollIntoView(nearest)`.
**`renderSpread(animate)` L2969:** `animate` ∈ `undefined | true | 'deal'`. Calls `updateFactsBox` (`factLines(computeSpreadFacts)` when ≥2 cards), `renderBoard('deal'|'')`, sets `#spreadList.pending` (opacity 0) for deal, rebuilds `aiCardsBg` if the spread key changed while on, rebuilds `.spread-item` rows (thumb flip, position badge with `posDesc` tooltip, name, suit, `corrChips`, Xuôi/Ngược toggle, ✕). `animate===true` → reveal thumbs at 220+idx·240ms. Toggles `interpretBtn`/`clearSpreadBtn` disabled.
**`renderBoard(mode)` L2733 / `dealBoard(done)` L2767:** absolute-positioned `.board-slot` (numbered, label unless W>6) + `.board-card.spread-flip` from `layoutGeom(SPREAD_LAYOUT[k] || freeLayout(n))` (`--ar`, `--bw`); cross card rotated 90°. Deal: WAAPI fly-in from above board centre, stagger 280ms (190 if >7), 560ms flight, reveal +140ms, `done` after the last one.
**Result panel visibility:** `syncResultPanel` L2530 via `MutationObserver` on `#aiOutput` (childList/subtree/characterData/class). Hidden while the output is the hint text and chat is hidden.
**`updateProviderLabel(p)` L2518:** heading always "✦︎ Lời giải / Your reading" (no provider name); `#aiQuota` shows remaining free readings when the active provider is `free` and `freeAiInfo.remaining != null`.
**`renderCloudNote()` L1996:** on/off sentence with an inline link.
**Reads:** `spread`, `spreadKey`, `spreadPositions`, `selectedDeck`, `settings`, `freeAiInfo`, `lastProviderUsed`, `lang`, `CARD_EN`, `currentReading`, `chatMessages`. **Writes:** `spread`, `uidCounter`, `spreadKey`, `spreadPositions`, `pickerActive`, `chatMessages`, `lastAnswerText`, `currentReading`, `aiBg`; localStorage `tarotCloudSave` (+removes `tarotCloudBackfill` when turned on), `tarotDeviceId` (via `deviceId`); IndexedDB readings.
**Hands off:** to lightbox. Entered from landing (`go`), draw (`drawToReading`), history (`loadReading`), share link (`loadSharedFromHash`).
**Notable:** ≥981px two-column step grid with sticky step heads (L315–329); ≤980px sticky bottom `.reading-actions` bar (L816). Floating cards behind the output (§4.7). The ritual overlay quotes `#questionInput` even when started from the Draw view.

**`loadReading(it)` L4314** (used by history Reload and share link): sets question, `spread` (new uids), switches deck if single & known (re-renders tabs + filter), restores spread type (`applySpreadType`) else `renderSpread()`, `switchMode('reading')`, renders markdown answer, `lastAnswerText`, `aiBgMode('done'|'off')`, shows share buttons, **resets chat** (`chatMessages=[]`), `currentReading = it.id != null ? it : null`, `showReadingNote`, `scrollTo top`.

---

### 1.5 History (`#historyView`, L1077–1092; JS L4375–4552)
**Key ids:** `clearHistory`, `histSearch`, `exportJson`, `exportMd`, `importJson`, `journalImportFile` (hidden file input), `historyList`.

| Event | Handler | Effect |
|---|---|---|
| enter view | `switchMode('history')` → `renderHistory` L4380 | `idbAllReadings`, newest first, filter by `readingHaystack` |
| `#histSearch` input | L4455 | debounce 200ms → `renderHistory` |
| `#clearHistory` | L4448 | `confirm()` → `idbClearReadings`, `currentReading=null`, hide note, re-render. Hidden when list empty |
| `#exportJson` | `exportJournalJson` L4477 | download `tarot-journal-YYYYMMDD-HHMM.json` `{app,kind,version:1,exportedAt,readings,dailyNotes}` |
| `#exportMd` | `exportJournalMarkdown` L4484 | download `.md` (readings + daily notes) |
| `#importJson` → `#journalImportFile` change | `importJournalJson` L4518 | merge, dedupe by `ts|question`, mark `imported:true` (never cloud-synced), import missing `dailyNote:*`; `alert()` summary; reset input |
| item "Xem/View" | L4433 | toggle `.hist-detail.open`, label Ẩn/Hide |
| item "Tải lại/Reload" | `loadReading(it)` | → reading |
| item ✕ | L4439 | `confirm()` → `idbDeleteReading`, clear `currentReading` if same, re-render |
| detail note textarea input | L4431 | `saveNoteDebounced(it, …)` (also syncs `currentReading.note` when same id) |

Item DOM: `.hist-item > .row > .info(.time, .q, .time summary, .hist-note-preview) + .hist-actions`; `.hist-detail` = cards with positions, static facts box, rendered answer, follow-ups, note field.
**Reads:** IndexedDB, `lang`, `currentReading`. **Writes:** IndexedDB, `currentReading`, localStorage `dailyNote:*` (import). **Hands off:** reading (Reload). **Helpers:** `downloadText` L4458, `collectDailyNotes` L4466, `exportStamp` L4476, `orientLabel` L4376.

---

### 1.6 Daily (`#dailyView`, L1094–1103; JS L2473–2493)
**Key ids:** `dailyDate`, `dailyCard`, `dailyNote`.
| Event | Handler | Effect |
|---|---|---|
| enter view | `switchMode('daily')` → `renderDaily` L2476 | card = `rows[hashStr(dailyKey()+'|'+selectedDeck) % n]` (deterministic per day + deck); always upright; image, name + "Xuôi" badge, suit, `corrChips`, keywords, meaning; loads note |
| `#dailyNote` input | L2493 | `localStorage['dailyNote:'+dailyKey()]` (key `Y-M-D`, **not zero-padded**) |
Also re-rendered by `setDeck` (if visible) and `refreshLangViews`. **Reads:** `db`, `selectedDeck`, `lang`. **Hands off:** none. Daily is the **default mode at boot**. The image is not lightbox-clickable.

---

### 1.7 Yes/No (`#yesnoView`, L1106–1123; JS L2136–2250)
**Key ids:** `yesnoQ`, `yesnoBtn`, `ynChips .qchip` ×5, `yesnoResult` (built: `#ynVerdict`, `img[data-full][data-rev]`, `.yn-card-name`, `#ynWhy`).
| Event | Handler | Effect |
|---|---|---|
| `#yesnoBtn` click / `#yesnoQ` Enter | `drawYesno` L2178 | random card from selected deck + random orientation (50%); haptic, `ensureAudio`, `playTick`; render result `.show` (fade anim), burst at image. If `aiConfigured()` → verdict "…" + spinner, then `chatComplete` with an inline yes/no system prompt (VI/EN), parse `PHÁN QUYẾT:/VERDICT:` line → `ynClass`, body → `renderMarkdown`. Else / on error → `localVerdict` (YN_MAYBE regex → maybe; reversed → no; else yes) + `firstSentence(meaning)` |
| `#ynChips .qchip` | L4111 | fill + focus `#yesnoQ` |
| result `img` click | `bindImg` L2194 | lightbox (rotated if reversed) |
**Reads:** `db`, `selectedDeck`, `settings`, `lang`. **Writes:** nothing persistent (not saved to history). **Hands off:** none.

---

### 1.8 Sky (`#skyView`, L1126–1152; JS L5124–5325) — imperative engine §4.1
**Key ids:** `skyLoc` (hcm/hanoi/danang/cantho/gps), `skyResetView`, `skyZoomOut`, `skyZoomIn`, `skyTgLines`, `skyTgGrid`, `skyTgBodies`, `skyTgStars` (`.sky-tg.on`), `skyFull`, `skyInfo`, `.sky-stage` > `skyCanvas`.
| Event | Handler | Effect |
|---|---|---|
| enter / leave view | `switchMode` → `skyStart()` / `skyStop()` L5249–5250 | start/stop rAF loop |
| `#skyLoc` change | L5256 | clear selection; save `tarotSkyLoc`; `gps` → `navigator.geolocation` (status texts in `#skyInfo`); else set lat/lon/name; recompute |
| `#skyResetView` | L5267 | rot 0, zoom 1, clear selection |
| `#skyZoomIn/Out` | L5271–5272 | zoom ×/÷1.2, clamp 0.6–2.6 |
| `#skyTg*` | L5273–5276 | toggle `skyvL.lines/grid/bodies/starsOnly`, save `tarotSkyLayers`, sync `.on` |
| canvas pointerdown/move/up/cancel | L5280–5292 | 1 pointer drag → rotate (0.006 rad/px); 2 pointers pinch → zoom; tap (<6px move) → `skyvPick` (nearest star/body within 20px, plus nearest constellation highlight) |
| canvas wheel (non-passive) | L5293 | zoom ×1.1/×0.9 |
| `#skyFull` | L5295 | toggle Fullscreen API on `.sky-stage` (webkit fallback) |
| window resize, fullscreenchange | L5277, L5303–5304 | `skyvResize` (+compute) |
**Reads/Writes:** `skyv*` globals; localStorage `tarotSkyLoc`, `tarotSkyLayers`. **Hands off:** none.

---

### 1.9 AI Settings overlay (`#settingsOverlay`, L1156–1265; JS L3024–3363)
**Key ids:** provider tabs `provGemini provBeeknoee provZenmux provOllama` (`[data-provider]`, `.on`); field groups `geminiFields beeknoeeFields zenmuxFields ollamaFields`; inputs `geminiKey geminiModel(+datalist geminiModelList) beeknoeeKey beeknoeeUrl beeknoeeModel(+list) zenmuxKey zenmuxUrl zenmuxModel(+list) ollamaUrl ollamaKey ollamaModel(+list)`; buttons `loadGeminiModels testGeminiModel loadBeeknoeeModels testBeeknoeeModel loadZenmuxModels testZenmuxModel loadOllamaModels testOllamaModel`; status `geminiModelStatus beeknoeeModelStatus zenmuxModelStatus ollamaModelStatus`; checkboxes `freeAi autoFallback`; `savedNote`; `closeSettings`, `saveSettings`.
| Event | Handler | Effect |
|---|---|---|
| `#openSettings` (nav) | `openSettings` L3083 | reload `settings`, `setProviderUI`, fill all fields, preseed datalists with `RECOMMENDED`, clear `savedNote`, `closeNav`, add `.open` |
| `#closeSettings`, backdrop click | `closeSettings` L3105 | remove `.open` (no Esc) |
| provider tab click | `setProviderUI(p)` L3035 | toggles `.on` + shows one field group (UI only until Save) |
| `#saveSettings` | L3113 | provider = tab with `.on`; build settings (trim, strip trailing `/`, defaults); `saveSettings` → localStorage `witchesTarotAI`; `savedNote` "✓ Đã lưu… Dự phòng: a → b" (VI only); `updateProviderLabel()` |
| load-models buttons | `loadGeminiModels` L3141, `loadBeeknoeeModels` L3253, `loadZenmuxModels` L3313 (via `proxyFetch`), `loadOllamaModels` L3176 (local fetch or proxy) | fetch model list → `populateModels` (recommended first, fills datalist, picks value); status text |
| test-model buttons | `testGeminiModel` L3199, `testBeeknoeeModel` L3277, `testZenmuxModel` L3337, `testOllamaModel` L3225 | real 1-shot call; status ✓/✗ |
**Helpers (UI, not ported):** `fillDatalist` L3052, `preseedDatalist` L3058, `seedSelect` L3063, `populateModels` L3066, `_normModel` L3051, `RECOMMENDED` L3047, `proxyFetch` L3306 (`/api/llm` with `x-target-url`), `ollamaIsLocal` L3572.
**Reads/Writes:** `settings`; localStorage `witchesTarotAI`. Every status/hint string here is **VI only** except the 5 `data-i18n` items (title, freeAi + hint, fallback + hint, close, save).

---

### 1.10 Site settings overlay (`#siteOverlay`, L1268–1337; JS `initSiteSettings` L2389–2471, `initCardBack` L5677, `initTheme` L5701, `initCloudSave` L2010)
**Key ids:** `langSel`, `themeSel`, `cardBackSel` + `cardBackGrid` (`.cb-opt[data-k]`), `siteRitual`, `siteSound`, `siteSoundVol` (range), `siteCloud`, `ambientMode` (off/mystic/candle), `ambientVol` (range), `siteFx`, `skyMode` (deco/real), `skyCityRow` > `skyCity`, `skyHint`, `closeSite`.
| Event | Handler | Effect |
|---|---|---|
| `#openSite` (nav) | L2391 | sync ritual/sound/vol/ambient/fx/sky/city/lang into form; `refreshSkyUI`; `closeNav`; `.open` |
| `#closeSite`, backdrop | L2430–2432 | remove `.open` |
| `#langSel` change | L2406 | `lang`; `tarotLang`; `ensureCardEn` (EN); `applyLang`; `recomputePositions`; `refreshLangViews`; `renderMoon`; `updateReadingDeckInfo`; `updateDrawInfo`; `updateProviderLabel`; `updateSpreadHint`; `renderHistory` if visible |
| `#themeSel` change | `initTheme` L5709 | set/remove `html[data-theme]`, dispatch `themechange`, save `theme` |
| `#cardBackSel` change / `.cb-opt` click | `initCardBack` apply L5689 | `:root --cardback = CB.css(k)`; `.on` on grid; save `cardBack` |
| `#siteRitual` change | L2434 | `ritualDone = !checked`; save `tarotRitual` '1'/'0' |
| `#siteSound` change | `setSoundOn` | `tarotSound` |
| `#siteSoundVol` input | L2440 | `soundVol`; `tarotSoundVol` |
| `#siteCloud` change | `setCloudSave` L2005 | `tarotCloudSave`; re-render `#cloudNote` |
| `#ambientMode` change | L2444 | `ambientMode`; `tarotAmbientMode`; `stopAmbient()` / `startAmbient()` |
| `#ambientVol` input | L2449 | `ambientVol`; `tarotAmbientVol`; `applyAmbientVol()` |
| `#siteFx` change | L2454 | `html[data-fx]=on/off`; `tarotFx` |
| `#skyMode` / `#skyCity` change | L2459 / L2465 | `html[data-sky]` / `html[data-skycity]`; save `tarotSkyMode` / `tarotSkyCity`; `refreshSkyUI`; dispatch `skychange` (starfield listens) |
`refreshSkyUI` L2421: shows the city row only for `real`, sets `#skyHint` text (VI/EN). Card-back names are rendered **once at init** in the current language (not refreshed on lang change). The theme `<option>` labels, the city options and the intro hint are VI only.

---

### 1.11 Nav: drawer (<1024px) and desktop dome menu (≥1024px) (`#navMenu`, L921–934; JS L1905–1964)
**Key ids:** `navToggle`, `navScrim`, `navClose` (in `.nav-head`), `goHome`, `modeDaily` (has `.active` in markup), `installBtn` (hidden), `modeBrowse`, `modeDraw`, `modeReading`, `modeSky`, `modeYesno`, `modeHistory`, `openSettings`, `openSite`. JS-injected: `.nav-deco` (dust, SVG arch with animated `navShine` gradient unless reduced motion, two `.st` stars) inserted first; `.nav-sep` inserted before `#openSettings`.
| Event | Handler | Effect |
|---|---|---|
| `#navToggle` | `openNav` L1906 | `.open` on `#navMenu` + `#navScrim` |
| `#navClose`, `#navScrim` | `closeNav` L1907 | remove `.open` |
| `#mode*` click | `switchMode(m)` L1886 | §3 (also calls `closeNav`) |
| `#goHome` | `goLanding` | landing |
| `#installBtn` | L2128 | PWA prompt §7 |
| `#openSettings` / `#openSite` | §1.9 / §1.10 | both call `closeNav` |
| window resize, `navDesk` change, `beforeinstallprompt` | `layoutNavArc` L1935 | sets `--ay = 13·t²` px per visible `.tab-btn`/`.nav-sep` → parabolic arch |
| window scroll (passive, rAF-throttled) | `navAutoHide` L1946 | desktop only: y<160 → show; dy>8 → `.nav-hidden`; dy<−8 → show |
| window mousemove clientY<70 (desktop) / nav focusin | L1961–1962 | show |
State: `.active` class on the current mode button (set by `switchMode`). Desktop styling L693–759: sticky top bar, column icon+label, rotating dashed ring on active, sparkle on hover. Drawer styling L133–145.

---

## 2. Global state

### 2.1 Top-level `let`/`var` (script scope)
| Name | L | Meaning | Written by |
|---|---|---|---|
| `lang` | 1350 | `'vi'|'en'` (init from `tarotLang`) | `#langSel` change L2407 |
| `CARD_EN` | 1460 | EN meanings map (lazy `/card_en.json`) | `ensureCardEn` L1464 |
| `cardEnLoading` | 1460 | fetch in-flight flag | `ensureCardEn` |
| `db` | 1497 | sql.js Database | `boot` L5507 |
| `selectedCategory` | 1498 | browse suit filter (`'all'` or `bo`) | tile click L1856, `setDeck` L4160, `loadReading` L4321 |
| `selectedDeck` | 1499 | current deck name | `boot` L5510, `populateDeckSelect` L4143, `setDeck` L4157, `loadReading` L4318 |
| `baseDecks` | 1500 | deck list at boot — **dead** (never read) | `boot` L5508 |
| `dbReady` | 1986 | DB loaded | `markDbReady` L1988 |
| `deferredPrompt` | 2125 | PWA install event | `beforeinstallprompt` L2126, install click, `appinstalled` |
| `ambientMode` | 2254 | `'off'|'mystic'|'candle'` | init L2256–2258 (migrates `tarotAmbient`), `#ambientMode` change |
| `ambientVol` | 2254 | 0–1 | init L2260, `#ambientVol` input |
| `ambientNodes` | 2254 | running ambient graph `{master,oscs,lfo,timer,timers}` | `startAmbient`/`stopAmbient` |
| `freeAiInfo` (`let` obj) | 2501 | `{model, remaining}` from `/api/ai` headers | `callFree` L3632–3634 |
| `spread` | 2546 | cards in the reading `{uid,id,deck,ten,bo,so,y_nghia_xuoi,nghia_nguoc,tu_khoa,image_url,orientation}` | `addToSpread`, orient toggle (mutates item), `.rm`, `#clearSpreadBtn`, `DRAW_CTX.reading.onPicked`, `#drawToReading`, `loadReading` |
| `uidCounter` | 2547 | spread item uid seq | `addToSpread`, `toSpreadCard`, `loadReading` |
| `spreadPositions` | 2548 | position labels or `null` (free) | `applySpreadType`, `recomputePositions` |
| `spreadKey` | 2549 | spread type key (default `'free'`) | `applySpreadType` |
| `searchIndex`, `searchIndexDeck` | 2834 | smart card-search index cache per deck | `buildSearchIndex` |
| `pickerActive` | 2917 | highlighted picker result | `renderPicker`, `setPickerActive` |
| `settings` | 3032 | AI settings object | `openSettings` (reload), `#saveSettings` |
| `tmpDeviceId` | 3605 | fallback device id (excluded area) | `callFree` |
| `lastProviderUsed` | 3646 | provider that answered last | `chatComplete` |
| `aiBg` (`var`) | 3705 | `{cards,anims,litTimer,lit,key}` floating-card bg | `aiBgBuild/aiBgClear/aiBgMode` |
| `chatMessages` | 3772 | conversation for the current reading | `interpret`, `sendFollow`, `loadReading` |
| `lastAnswerText` | 3773 | last AI answer (share image/link) | `interpret`, `loadReading` |
| `currentReading` | 4237 | IndexedDB record being annotated | `saveReading`, `interpret` (null), `loadReading`, history delete/clear |
| `_histSearchT` | 4454 | debounce timer | histSearch input |
| `lastDraw` | 4555 | Draw-view result | `DRAW_CTX.draw.onStart/onPicked` |
| `soundOn`, `soundVol` | 4596 | sfx enabled / volume (init `tarotSound`, `tarotSoundVol`) | `setSoundOn`, `#siteSoundVol` |
| `audioCtx` | 4599 | shared AudioContext (sfx + ambient) | `ensureAudio` |
| `tickTimer` | 4599 | **dead** (never set non-null) | — |
| `noiseBuf` | 4599 | 0.2s white-noise buffer | `ensureAudio` |
| `fxSources` | 4615 | scheduled sfx sources (to stop) | `track`, `stopShuffleAudio` |
| `noiseLong` | 4616 | 2s pink-noise buffer | `longNoise` |
| `reverbNode`, `reverbCtx` | 4616 | shared sfx convolver bus | `reverbBus` |
| `drawCtx` | 4810 | active `DRAW_CTX` entry (singleton) | `startOrbit` |
| `orbitMode` | 4811 | `'draw'|'pick'` of the current shuffle | `startOrbit` |
| `shuffleLoop` | 4825 | `{timer,raf,anims,cycle}` | `startShuffleLoop`, `stopShuffleLoop` |
| `moonSvgSeq` | 4992 | unique SVG id counter | `moonSvg` |
| `ritualDone` | 5103 | true = skip ritual (init `tarotRitual==='0'`) | `#siteRitual`, ritual "don't show again" |
| `skyvData`, `skyvLoading` | 5126 | `/sky.json` cache + flag | `skyvLoad` |
| `skyvLat`, `skyvLon`, `skyvLocName` | 5127 | observer location | `#skyLoc` change, geolocation |
| `skyvRot`, `skyvZoom` | 5128 | view rotation (rad) / zoom 0.6–2.6 | drag/pinch/wheel/buttons/reset |
| `skyvComputedAt`, `skyvRAF`, `skyvActive`, `skyvT` | 5128 | recompute timestamp / rAF id / running / anim clock | sky engine |
| `skyvStars`, `skyvSegs`, `skyvSegsC`, `skyvLabels`, `skyvBodies`, `skyvConsts`, `skyvCx`, `skyvCy`, `skyvR` | 5129 | projected geometry cache | `skyvCompute` |
| `skyvNameByKey`, `skyvSel`, `skyvSelConst` | 5130 | star-name lookup / selected object / selected constellation | `skyvCompute`, `skyvPick`, location/zoom/reset |

### 2.2 Mutable `const` objects (written at runtime)
| Name | L | Mutation |
|---|---|---|
| `readyQueue` | 1986 | `whenReady` pushes; `markDbReady` drains |
| `DRAW_CTX.draw/.reading.session` | 4762 | incremented by `startOrbit` (all ctx) and `startManualPick`; invalidates stale timers |
| `_noteTimers` | 4348 | per-reading-id debounce timers |
| `skyvL` | 5131 | layer toggles `{lines,grid,bodies,starsOnly}` (from `tarotSkyLayers`) |
| `CB` cache | 5662 | memoised card-back SVGs |
| `freeAiInfo` fields | 2501 | (see above) |

### 2.3 Module-private state inside IIFEs / closures
| Where | L | State |
|---|---|---|
| `initLanding` | 2019 | `fanT` (resize debounce), `ti` (tip index), the `tips` arrays |
| `navAutoHide` | 1946 | `lastY`, `ticking` |
| `startManualPick` closure | 5353 | `pool`, `picks`, `cards`, `session`, geometry (`cw`, `W`, `R`, `half`, `maxA`) |
| `startAmbient` closure | 2262 | `step`, `nextT`, `idx`, `phrase`, `rhythm` |
| `initSkyView` closure | 5279 | `ptrs` Map, `pinch`, `startRot`, `lastX`, `downX`, `downY`, `moved` |
| `starfield` IIFE | 5718 | `W,H,stars,sparks,meteors,t,nextMeteor,starCol,sparkCol,skyMode,skyCity,sky,skyLoading,skyPts,skySegs,skyLabels,skyBodies,skyR,skyCx,skyCy,skyComputedAt` |

### 2.4 DOM-attribute state
| Attribute | Set by | Read by |
|---|---|---|
| `html[data-theme]` (`''|night|rose|light`) | L833 bootstrap, `initTheme` | CSS L54–82 etc.; starfield via computed `--star/--spark` |
| `html[lang]` | `applyLang` L1431 | CSS `.lt-seo` hide (L162) |
| `html[data-fx]` (`on|off`) | `initFx` L2382, `#siteFx` | CSS L637; starfield `frame` L5791 |
| `html[data-sky]`, `html[data-skycity]` | `initSky` L2383, `#skyMode/#skyCity` | starfield `readSky` |
| `html[data-skycompass]='off'` | L2387 | **dead** (nothing reads it) |
| `:root --cardback` | `initCardBack` | `.flip-front`, `.riffle-card`, `.sff.front`, `.lt-fan .lc`, `.st-card`, `.aibg-card` |
| `body[data-mode]` | `switchMode` | CSS L531 (hide `#deckBar` in browse/reading) |
| `el.dataset.vi / viph / qvi / ico / tilting` | `applyLang`, `initIcons`, tilt | i18n §5, tilt §4.8 |

### 2.5 localStorage keys (UI-owned; AI settings key listed for completeness)
`theme`, `tarotLang`, `witchesTarotDeck` (`DECK_KEY`), `witchesTarotAI` (`SETTINGS_KEY`), `tarotCloudSave`, `tarotCloudBackfill` (`BACKFILL_KEY`), `tarotDeviceId`, `tarotAmbientMode`, `tarotAmbient` (legacy, read-only migration), `tarotAmbientVol`, `tarotFx`, `tarotSkyMode`, `tarotSkyCity`, `tarotSkyLoc`, `tarotSkyLayers`, `tarotRitual`, `tarotSound`, `tarotSoundVol`, `cardBack` (legacy aliases `moon→triple`, `night→stars`, `plain→sacred`), `dailyNote:<Y-M-D>`.

---

## 3. Mode switching / routing

### 3.1 `switchMode(mode)` L1887
`MODE_VIEWS` L1877 maps `browse|draw|reading|daily|sky|yesno|history` → `[navButtonId, viewEl]`. Each nav button gets a click listener (L1886).
1. `document.body.dataset.mode = mode`.
2. For every mode: toggle `.active` on its nav button; `view.style.display = 'block' | 'none'`.
3. Restart the `.view-in` animation on the shown view (remove class, reflow, add).
4. Always: `updateReadingDeckInfo()`, `updateProviderLabel()`, `updateDrawInfo()`.
5. `history` → `renderHistory()`; `daily` → `renderDaily()`.
6. `sky` → `skyStart()`; any other mode → `skyStop()`.
7. `closeNav()`.

Not touched: URL, hash, `history.pushState`. **The browser Back button leaves the app.** Scroll position is not reset (callers such as `loadReading` and `drawToReading` scroll themselves). In-flight shuffles/wheels are not cancelled when you switch views.

### 3.2 Initial view and deep links
- First screen is always the `#landing` overlay. `#appPage` is hidden.
- `boot()` calls `switchMode('daily')` while `#appPage` is still hidden. So "enter" (brand button) lands on **Daily**.
- **Only deep link: `#r=<payload>`** (`loadSharedFromHash` L4072). It runs after `markDbReady()` in `boot()`. On success: `loadReading(...)` (→ reading), prepend `.shared-note` warning in `#aiOutput`, then `enterApp()` (skips landing). Payload: `decodeShare` → `{q,d,p,a,c[]}`. Cards are rebuilt from the DB by id when possible. Otherwise text is clipped and images are only allowed from `https://(www.)tarot.vn/`. Deck is whitelisted to `Witches Tarot`/`Rider-Waite`. Limits: question 500 chars, answer 14,000 chars, 15 cards. Legacy object-form cards and label-array `p` are supported.
- The hash is **never cleared**, and there is **no `hashchange` listener**. Reloading re-applies the share.
- No other hash or query parameters are parsed.
- If the DB fails to load: `#bootStatus` shows an error, `dbReady` never becomes true, and landing CTAs (`whenReady`) **never fire** (the brand button spins forever).

### 3.3 Script execution order (= boot sequence)
The script is classic and non-module, and it runs top to bottom. `boot()` is async, so everything after L5526 runs before the DB resolves.
1. L833 inline: `localStorage.theme` → `html[data-theme]` (before first paint).
2. L1344 `sql-wasm.js` (blocking CDN script).
3. L1350–1351 `lang` from `tarotLang`.
4. L1758–1761 browse pages-link listeners. L1873–1874 search/clear listeners. L1886 mode-button listeners. L1908–1910 drawer listeners.
5. L1914 `initNavDecor` (inject `.nav-deco`, `.nav-sep`). L1943 `layoutNavArc()` + resize. L1946 `navAutoHide`.
6. L1989 `#landingEnter` listener, L1994 `#goHome`.
7. L2010 `initCloudSave` (checkbox state, cloud note).
8. L2019 `initLanding` (fan layout, tips interval, form handlers).
9. L2101 `initTilt` (skipped on `pointer: coarse`).
10. L2126–2133 PWA listeners.
11. L2249–2250 yes/no listeners.
12. L2255–2260 ambient prefs. L2375–2378 if ambient ≠ off: one-shot `pointerdown`/`keydown` "kick" → `startAmbient()` (autoplay policy).
13. L2382 `initFx` (`html[data-fx]`). L2383 `initSky` (`data-sky`, `data-skycity`, `data-skycompass`).
14. L2493 daily note listener. L2537 `MutationObserver(syncResultPanel)`.
15. L2703–2707 spread-picker nav listeners.
16. L3013–3022 picker / clear-spread listeners.
17. L3032 `settings = loadSettings()`. L3106–3138 settings modal listeners. L3223–3363 model buttons.
18. L3855 interpret. L4004 share image. L4065 share link. L4106–4111 chat + chips. L4112 `#spreadType` change. **L4113 `renderSpreadOptions()`** (builds the hidden select + spread tiles). **L4114 `updateSpreadHint()`**. L4127 TTS.
19. L4154 deck-select listeners.
20. L4312 `whenReady(() => setTimeout(cloudBackfill, 2500))`.
21. L4371 reading note. L4448–4455 history. L4549–4552 export/import.
22. L4596–4598 sound prefs. L4757 `initSoundBtn()`.
23. L5104 `ritualDone` from `tarotRitual`.
24. **L5118 `renderMoon()` → L5119 `initSiteSettings()` → L5120 `initIcons()` → L5121 `applyLang()` → L5122 `ensureCardEn()` (EN only).** `initIcons` must precede `applyLang`.
25. L5132 sky layers from `tarotSkyLayers`. L5325 `initSkyView()`.
26. L5327–5328, L5479–5490 draw/pick/stop/drawToReading listeners. L5498 lightbox close.
27. **L5526 `boot()`**. Async part, in order: `initSqlJs` (CDN wasm) → `fetch('tarot.db')` → `new SQL.Database` → `baseDecks` → `idbClearOldDecks()` → `selectedDeck` from `witchesTarotDeck` → `populateDeckSelect()` → `renderCategoryTabs()` → hide `#bootStatus`, show `#deckBar` → `switchMode('daily')` → `updateFilter()` → `renderSpread()` → `markDbReady()` (flushes queued landing clicks + schedules backfill) → `loadSharedFromHash()` → `enterApp()` if the share loaded.
28. Synchronous, after `boot()` was called: L5677 `initCardBack()` (builds options/grid, applies `--cardback`). L5701 `initTheme()` (applies theme, `themechange`).
29. L5714 SW registration on `window.load`.
30. L5718 `starfield()` IIFE (starts the background rAF and defines `window.tarotBurst`).
31. L5897 / L5900 Vercel Speed Insights + Web Analytics (`defer`).

`whenReady(cb)` L1987 is the DB-ready gate used by landing actions and backfill.

---

## 4. Imperative engines (keep imperative; wrap in hooks/refs)

### 4.1 Sky map (interactive view) — L5124–5325 (+ `celestialBodies` L5037)
- **Entry points:** `initSkyView()` (once; binds controls and canvas), `skyStart()`, `skyStop()`, `updateSkyInfo()`. Internal: `skyvLoad(cb)`, `skyvResize()`, `skyvCompute()`, `skyvDraw()`, `skyvLoop()`, `skyvPick(x,y)`, `skyvRR()`.
- **Inputs:** `/sky.json` `{stars:[ra,dec,mag][], lines:[abbr,[[ra,dec]…]][], names:[ra,dec,name][], consts:[ra,dec,name,abbr][]}`. Observer lat/lon (`SKY_CITIES` L5125 or GPS). `skyvRot`, `skyvZoom`, `skyvL`. CSS var `--star` (read every frame via `getComputedStyle`). `lang` (N/S/E/W labels, info text). `Date.now()` (recompute every 30s).
- **Projection:** zenith-centred azimuthal (alt>0 only), via GMST/LST. `R = 0.46·min(W,H)·zoom`. Rotation is applied at draw time (labels stay upright).
- **DOM owned:** `#skyCanvas` backing store (DPR ≤2). `.grabbing` class. Fullscreen on `.sky-stage`.
- **Draw layers:** grid (alt 30/60, az every 30°), horizon ring, constellation lines, selected constellation glow, twinkling stars, bodies (moon with phase shadow), constellation/star/body labels, compass letters, selection pulse + info box.
- **Teardown:** `skyStop()` cancels the rAF. Listeners (window resize, fullscreenchange, canvas pointer/wheel) are **never removed**.
- **Duplication:** the projection maths are implemented twice (here at L5146, and in the starfield at L5743). **Bug:** `sky.json` `lines` items are `[abbr, poly]` (checked: `["And",[[30.97,42.33],…]]`). The sky view reads them correctly (L5164). The starfield (L5764) treats each item as a polyline, which produces NaN segments, so **constellation lines never draw in the background real-sky mode**.

### 4.2 Ambient music — L2252–2378 (Web Audio)
- **Entry points:** `startAmbient()`, `stopAmbient()`, `applyAmbientVol()`. Auto-start kick L2375.
- **Inputs:** `ambientMode`, `ambientVol`, shared `audioCtx` (`ensureAudio`), `noiseBuf` (candle), `makeReverb(dest)` L4636.
- **Graph:** master gain → DynamicsCompressor → makeup gain ×2 → destination. Fade-in time constant 1.5s.
  - `mystic`: generative kalimba plucks over Dm7–Bbmaj7–Gm7–C, BPM 66, 4 rhythm patterns, occasional bells. Lowpass 2600 Hz + reverb send. Lookahead scheduler `setTimeout(schedule, 250)` schedules ~1.2s ahead.
  - `candle`: 68 Hz sine bed through lowpass 300 Hz + random band-passed noise crackles (`setTimeout` 55–475ms).
- **DOM:** none.
- **Teardown:** `stopAmbient()` clears timers, fades master (0.4), stops oscillators and disconnects after 1200ms. `AudioContext` is **never closed**.

### 4.3 Card SFX — L4595–4757 (Web Audio)
- **Entry points:** `ensureAudio()`, `cardFlick(t,pan,vol)`, `cardWhoosh(t,dur,vol)`, `cardThump(t,vol)`, `revealChime(t,idx,vol)`, `riffleBurr(t,dur,n,vol)`, `playTick()`, `startTicks(dur)` (reshuffle burst), `stopTicks()`, `stopShuffleAudio()`, `setSoundOn(v)`, `initSoundBtn()`.
- **Inputs:** `soundOn`, `soundVol`, `audioCtx.currentTime` (sounds are scheduled on the audio clock to match the visuals). Helpers: `longNoise()` (pink), `reverbBus()`/`makeReverb()` (synthetic 3.2s IR), `fxOut(t,pan,wet)` (stereo panner + reverb send), `track(src)` → `fxSources`.
- **DOM:** `#soundToggle` styling, `#siteSound` sync.
- **Teardown:** `stopShuffleAudio()` stops all tracked sources. Buffers and context persist.
- **Callers:** shuffle loop, wheel pick (`cardFlick` on pick, `revealChime` on flip), yes/no (`playTick`), reshuffle (`startTicks/stopTicks`).

### 4.4 Shuffle animation ("orbit") — L4813–4966
- **Entry points:** `startOrbit(mode, ctxKey)`, `stopOrbit()`, `finishOrbit(mode)`, `resetOrbit(ctx)`, `buildOrbit(count)`, `startShuffleLoop(el, cards)`, `stopShuffleLoop()`, `vortexCycle(el,cards,loop,done)`.
- **Inputs:** `drawCtx` (DOM ids), `deckTotal(selectedDeck)` (8–24 visual cards), `soundOn`/`audioCtx`, `prefersReduced()`.
- **DOM owned:** `#drawOrbit`/`#spreadOrbit` (`.riffle.on`). Children: `zodiacWheelHTML()` (`.zwheel` SVG, `.show` added next rAF) + N `.riffle-card` divs. Toggles the `stop` button and disables the `lock` buttons.
- **Behaviour:** an infinite loop alternating **vortex** (rAF-driven 3.4s 3D swirl, inline transform + z-index per frame) and **riffle** (WAAPI keyframes per card, 1.65–1.9s, two halves interleave, DOM order re-sorted each cycle). Audio is scheduled per cycle.
- **Reduced motion:** `startOrbit` skips the shuffle and goes straight to `finishOrbit` (L4947).
- **Teardown:** `stopShuffleLoop()` (clearTimeout, cancelAnimationFrame, cancel anims, stop audio). `resetOrbit` also clears the DOM and unlocks buttons. Loop identity check `shuffleLoop !== loop || !el.isConnected` stops stale cycles.

### 4.5 Shared drawing engine — L4759–4966 + ritual L5102–5117 + wheel L5330–5478 + board deal L2767
**Contract (`DRAW_CTX` L4762, keys `draw` | `reading`):**
```ts
interface DrawCtx {
  orbit: string;            // id of .riffle shuffle stage   ('drawOrbit' | 'spreadOrbit')
  fan: string;              // id of .fan wheel stage        ('drawFan' | 'spreadFan')
  status: string;           // id of status line             ('pickStatus' | 'spreadPickStatus')
  stop: string;             // id of "Stop shuffling" button ('stopShuffle' | 'spreadStopShuffle')
  lock: string[];           // buttons disabled while shuffling
  count(): number;          // draw: #drawCount (1–12); reading: spreadPositions.length or #spreadDrawCount
  onStart(): void;          // reset target UI
  onPicked(cards: Card[]): void; // receives cards with .orientation
  doneMsg(k: number): string;
  session?: number;         // mutable run token
}
```
**Call chain:** button → `beginDraw(mode, ctxKey)` L5105 → (if `!ritualDone`: show `#ritualOverlay` with the question, `ensureAudio()`; `#ritualStart` (optionally persists "don't show again") / `#ritualSkip` via reassigned `onclick`) → `startOrbit` (bump `session` on **all** ctxs + `resetOrbit` each; set singleton `drawCtx`; `onStart`; hide fan/status; build orbit; show stop; lock buttons) → user taps Stop → `stopOrbit` → `finishOrbit(orbitMode)` → **`startManualPick(n, auto = mode !== 'pick')`** L5353.

**`startManualPick`:**
- pool = `drawRandomCards(deckTotal)` (full shuffled deck with random orientation, only reversed if the card has a reversed meaning).
- Builds `.fan` innerHTML: zodiac wheel + (manual only) `.fan-tools .fan-reshuffle`. One `.wcard > .wbody > .flip > .flip-inner > .flip-front/.flip-back(img)` per card. `--a` angle, `--d` delay, z-index. Geometry is from computed `--cw`/`--R` and the fan width.
- Double rAF → `.zwheel.show` + `.fan.spread` (CSS transition rolls the wheel out).
- Pick: `.picked` (lift), sfx, eager image load. When n are picked → `finishPick`: `.locked`; set `--fa/--fy/--fs` final layout; +700ms `.chosen` (others sweep away); +1500ms staggered 380ms `.flip.revealed` + chime + burst; then `ctx.onPicked(cards)` and `status = doneMsg(k)`.
- Auto mode: picks n evenly-spread random indices, starting at 1700ms, gap 460ms (300 if n>6). User taps are ignored.
- Reshuffle: `.reshuffle` class (sweep), `startTicks`, after 1100ms replace back images with a new pool.
- All timers are guarded by `live()` (`ctx.session === session`).

**Reading `onPicked`** L4789: `spread = cards.map(toSpreadCard)`; `renderSpread('deal')`; +1600ms hide `#spreadFan`, scroll to board (or list); +450ms `dealBoard(() => remove #spreadList.pending)`. Session-guarded.

- **Singleton:** `drawCtx` is global, so only one draw runs at a time across both views. Starting one cancels the other.
- **Reduced motion:** all delays collapse to 0.
- **Teardown:** none for the wheel (DOM is replaced on the next run or hidden). `dealBoard` timeouts are not cancellable (only the outer reading timers are session-guarded).

### 4.6 Background starfield / real-sky — L5718–5892 (+ `#bgAura` CSS L453–457)
- **Entry points:** IIFE (auto-starts). Global `window.tarotBurst(x,y,n)`. Listens to window `themechange` (re-read `--star/--spark`), `skychange` (re-read `html[data-sky|data-skycity]`, lazy-load `/sky.json`), resize (re-init stars), mousemove (cursor sparks, max 36, unless reduced motion).
- **Inputs:** `html[data-fx]` (checked every frame; off = clear + keep looping), `data-sky` (`deco|real`), `data-skycity` (hanoi/danang/hcm), `celestialBodies(jd)`, `prefersReduced()` (evaluated once at init).
- **Modes:** `deco` = ≤120 random twinkling, slowly falling stars. `real` = projected real sky (`R=0.62·max(W,H)`, recompute every 30s) with lines, labels, bodies, compass B/N/Đ/T (VI letters only). Both: sparks + meteors (every 2.5–7.5s) unless reduced motion.
- **DOM owned:** `#bgStars` full-viewport canvas (no DPR scaling).
- **Teardown:** **none**. The rAF runs forever, even when fx is off or the tab is idle.

### 4.7 Floating cards behind AI output — L3702–3770
- **Entry points:** `aiBgMode('thinking'|'done'|'off')`, `aiBgBuild()`, `aiBgClear(keepBox)`, `aiBgKey()`.
- **Inputs:** `spread` (first 12 cards), `prefersReduced()`.
- **DOM owned:** `#aiCardsBg` children `.aibg-card > img(.rev)`. Classes `on/thinking/done` on the box, `.lit` on a card. `#aiSection.bg-on` (min-height).
- **Behaviour:** WAAPI drift per card (16–26s, infinite alternate, random negative delay). `thinking` → playbackRate 2.4 + a `setInterval` 1500ms (2600 reduced) that lights each card in turn. `done` → rate 1, dim. Rebuilt only when `aiBgKey()` changes.
- **Callers:** `interpret`, `sendFollow`, `renderSpread` (rebuild on spread change while on), `loadReading`, `#clearSpreadBtn`.
- **Teardown:** `aiBgClear()` (clearInterval, cancel anims, empty box).

### 4.8 3D tilt — L2100–2116
- **Entry point:** `initTilt` IIFE (skipped when `pointer: coarse`).
- **Inputs:** delegated `pointermove`/`pointerout` on `document` for `.card-image, .draw-card, .yesno-result img`.
- **DOM:** inline `transform: perspective(760px) rotateX/Y(±6.5°)` + `transition`, `data-tilting`. Conflicts with any React-controlled `style.transform` on those elements.
- **Teardown:** none.

### 4.9 Share image export — L3857–4004
- **Entry point:** `exportReadingImage()` (button `#shareImgBtn`). Helpers `proxiedImg(url)` (tarot.vn → `/api/img?u=`; other hosts → placeholder to avoid canvas taint), `loadImg(src)` (crossOrigin anonymous), `wrapText(ctx,text,maxW)`.
- **Inputs:** `questionInput.value`, `lastAnswerText` (or `aiOutput.textContent`), `spread`, `spreadPositions`, `moonPhase(new Date())`, `dailyKey()`.
- **Output:** off-DOM canvas 1080 × dynamic height. Gradient bg, pseudo-random stars, header "✦︎ Witches Tarot" + moon line + date, question, card grid (≤5 per row, reversed rotated 180°), 2-line labels (`fitText` ellipsis), answer text. Uses NFC normalisation and the Arial stack (Vietnamese diacritics). Exports PNG. Touch devices with `navigator.canShare({files})` → share sheet; else `<a download>`.
- Button text "⏳ Đang tạo…" then restored. `alert()` on error. Strings are VI only ("% sáng", "Lá n", "(ngược)").
- **Teardown:** revokes the object URL after 4s.

### 4.10 Moon phase + planet positions — L4967–5100
- **Entry points:** `moonPhase(date)` L4968 → `{e, n, h, illum, age, frac, waxing}` (names/hints **VI only**). `moonSvg(frac, cls)` L4993 → SVG string (unique gradient ids via `moonSvgSeq`). `celestialBodies(jd)` L5037 → `[{name (VI), ra, dec, kind:'sun'|'moon'|'planet', color, size, illum?, waxing?}]` (Schlyter: Sun, Moon with perturbations, Mercury–Saturn). Helpers `eclToEq`, `eccAnom`, `RD/sind/cosd/atan2d/rev`. `renderMoon()` L5092 fills `#moonBadge` and `#landingMoon`.
- **Inputs:** `Date`. Pure apart from `renderMoon` (DOM) and `moonSvgSeq`. They are pure maths, so they can move to `services`/`lib` (not in the already-ported list).
- **Callers:** `renderMoon` (boot L5118, `goLanding`, lang change), `exportReadingImage`, sky view, starfield.

### 4.11 Other imperative bits
- **Zodiac wheel SVG** `zodiacWheelHTML()` L5330 (string builder; CSS-animated rings).
- **Card-back SVG generator** `CB` L5531–5669: 6 procedural designs (`zodiac, triple, sunmoon, sacred, eye, stars`) + raster `witches` (`/cardback-witches.webp`). `CB.css(k)` → CSS background value (data-URI SVG). Seeded RNG starfield. Uses no `<mask>` (Safari bug, comment L5550).
- **Landing fan** `layoutLandingFan` L2025 (see §1.1).
- **Spread board geometry** `layoutGeom`, `freeLayout`, `spreadArt` L2676–2691 (pure, depends on `SPREAD_LAYOUT`, `CARD_H`). `SPREAD_UI` L2660 (tile names/tags/badges) is not in the ported list.
- **Smart card search** `fold`, `ROMAN`, `SUIT_ALIAS`, `COURT_ALIAS`, `RANK_WORDS`, `MAJOR_ALIAS`, `STOP`, `buildSearchIndex`, `parseCardQuery`, `scoreCard`, `searchCards` L2804–2916. Pure logic, **not in the ported list**. Used by browse search and the reading picker.
- **Yes/No logic** `YN_MAYBE`, `firstSentence`, `localVerdict`, `ynClass`, inline prompt L2138–2230. Not in the ported list.

---

## 5. i18n

### 5.1 Mechanism
- `lang` (`vi` default) from `tarotLang`. `I18N = { en: {...} }` L1352–1394: **135 EN keys**. VI has **no dictionary**: the HTML text is the VI source.
- `t(key, fb)` L1395: returns the EN string if `lang==='en'` and the key exists, else the VI fallback literal passed by the caller.
- `applyLang()` L1430 (called at boot L5121 and on `#langSel` change):
  1. `html[lang]`; `renderCloudNote()`.
  2. `T_IDS` (L1397, 24 element ids → keys): snapshot VI text into `el.dataset.vi` on first run, then `setLabel(el, EN || vi)`.
  3. `T_PH` (L1405, 4 ids: searchInput, questionInput, yesnoQ, dailyNote): placeholder snapshot into `data-viph`.
  4. `[data-i18n]` (89 attributes / ~91 unique keys): same snapshot + `setLabel`.
  5. `[data-i18n-ph]` (6 attributes): placeholder swap.
  6. `[data-qen]` chips: snapshot `data-q` → `data-qvi`; `data-q` = EN or VI (this changes the question text sent to the AI).
  7. `#aiOutput` hint text, only while it still has `.ai-hint`.
- `setLabel(el, text)` L1417: if `el.dataset.ico` is set, rebuild as `<svg.ico><use href="#i-NAME"/></svg><span class="lbl">` and **strip the leading non-letter glyph/emoji** from the text. **`initIcons()` (L1424, map `ICON_OF` L1407) must run before `applyLang()`**, otherwise icon buttons lose their icons.
- The VI baseline is captured lazily on the first `applyLang`. Anything that rewrites a translated element's text before that point changes the "VI" string (e.g. the landing placeholder tip at L2065 becomes the `data-viph`).
- Everything else is inline `lang === 'en' ? EN : VI` / `en ? … : …` ternaries in JS: **~160 ternaries** (73 `lang === 'en'` occurrences plus local `en` aliases).
- Card meanings: `cardText(c)` uses `CARD_EN` (`/card_en.json`, Witches deck only). `refreshLangViews()` L1476 re-renders browse, daily and spread.
- On lang change these are **not** re-rendered: suit tiles (`renderCategoryTabs`), card-back names, the yes/no result, the draw results, the current AI answer, and the sky info until the next `updateSkyInfo`.

### 5.2 String count estimate
Method: 135 EN dictionary keys + ~160 JS ternary pairs + ~120 VI-only literals (HTML and JS). That is **≈420–480 distinct user-visible VI strings**, of which **≈300 have an EN equivalent**.

### 5.3 Dead EN keys (defined, never referenced)
`draw.count`, `reading.aiHead`, `reading.spread.free`, `reading.spread.ppf`, `reading.spread.sac`, `reading.spread.celtic`, `reading.spreadDraw`, `reading.spreadLabel` (each checked across `data-i18n`, `T_IDS`, `T_PH` and `t()`: 1 occurrence = the definition only).

### 5.4 VI-only strings (no EN override)
- **HTML:**
  - `<title>`, meta, OG and JSON-LD (L6–34; SEO, VI on purpose).
  - Ritual overlay: "Hít thở", lead text, `#ritualStart` "Bắt đầu xào bài" (icon only, no key), `#ritualSkip`, `#ritualDisable` label (L841–848).
  - `.lt-seo` block (hidden in EN). `landingEnter` title. `landingBurger`/`navToggle`/`navClose` aria-labels.
  - `#deckBar` label "Bộ bài:". `#bootStatus`.
  - Deck-select aria-label/title. Draw "Số lá:" label. `#soundToggle` title. `openSite` title.
  - Picker-nav aria-labels. `#spreadDrawBtn`/`#spreadPickBtn` titles.
  - `#ttsBtn` "🔊 Đọc", `#shareImgBtn` "📸 Tải ảnh", `#shareLinkBtn` "🔗 Link" + titles. `#chatInput` placeholder. `#chatSend` "Gửi".
  - History export-button titles. Sky zoom/fullscreen titles. Sky city options.
  - AI settings: everything except title, freeAi, fallback, close, save (provider hint, labels, key/URL hints, placeholders, load/test buttons, default status texts).
  - Site settings: intro hint, theme option labels, city options.
- **JS:**
  - `renderList` empty detail. Browse VI-only sections (hidden in EN rather than translated).
  - `moonPhase` names and hints, plus "% sáng" in `renderMoon` and the share image. `celestialBodies` names (sky labels). Starfield compass letters.
  - `streamInto` messages. `interpret` error and model advice. All model load/test statuses. `savedNote`.
  - Share image texts and `alert`. Share link "✅ Đã copy link", `prompt`, share text.
  - TTS voice fixed to `vi-VN`.
  - The `#readingDeckInfo` paragraph is translated, but the element stays `hidden`.

### 5.5 Translated only via EN override (VI lives in the HTML)
Every `data-i18n`, `data-i18n-ph` and `T_IDS`/`T_PH` element. Their VI text exists **only** in the HTML (snapshotted at runtime). A React port needs a VI dictionary extracted from these HTML nodes.

---

## 6. CSS map (L46–828)

| Lines | Styles |
|---|---|
| 47–82 | Theme tokens `:root` + `[data-theme=night|rose|light]`. Light-theme hard overrides (card-item, spread-item, hist-item, badge, qchip, chat, think-box, buttons) |
| 83–132 | Base: body, `.brand`, `.page`, header, h1, p, `.controls`, `.search`, select reset (custom arrow, `color-scheme` L98–99), buttons (+press, reduced motion), `.layout` grid, `.panel` glass, `.card-item`, `.details`, `.badge`, `.meta`, `.section`, `.card-image`, `.no-results`, links |
| 133–145 | Nav drawer `.nav-toggle`, `.nav`, `.nav.open`, `.nav-head`, `.nav-close`, `.nav-scrim` |
| 146–240 | Landing `#landing` (`.hide`), `.lt-seo` (162: hidden for `:root[lang=en]`), `.lt-top/.lt-brand/.lt-nav/.lt-burger`, `.landing-inner`, `.landing-moon`, `.lt-pre/.lt-title/.lt-emblem`, `.lt-form/.lt-stars/.lt-input/.lt-orn/.lt-arrow/.lt-count/.lt-err/.shake`, `.lt-disc`, `.lt-cta`, `.lt-skip`, `.lt-deco/.lt-circles/.lt-orb/.lt-fan .lc`, media 860/560/reduced, `landFade/landOut` |
| 241–247 | View transitions `.view-in`, `.page-in` (opacity only, so the fixed drawer does not jump) |
| 248–249 | Browse `.pages-link` |
| 250–287 | Browse suit tiles `.category-tabs.suits`, `.suit-tile`, `.st-scene/.st-bob/.st-card/.st-layer/.st-shadow/.st-name/.st-meta` (3D stack → fan on hover/active/focus), ≤760 scroll row |
| 288–292 | `.tab-btn` (nav items), `.status`, `.status.error` |
| 294–343 | Reading layout `.reading`, `.result-panel.is-empty`, `.step-desc`, `.picker-wrap` fade edges, `.picker-nav` (≥600), ≥981 two-column steps, `.sr-only`, `.step/.step-head/.step-no/.step-aside`, inputs, `.spread-hint` |
| 344–364 | Spread picker tiles `.spread-picker`, `.sp-tile[aria-checked]`, `.sp-art/.sp-box/.sp-card(.ghost)`, `.sp-name/.sp-meta/.sp-desc/.sp-badge` |
| 365–380 | Spread board `.spread-board` (`--bw`, `--ar`), `.board-slot(.cross)`, `.board-card(.cross/.await)`, `.num`, `#spreadList.pending` |
| 381–395 | `.step-sub`, `.draw-row`, `.count-field`, `.manual-add`, `#interpretBtn` size, `.btn-ghost`, `.reading-head`, `.ai-quota`, `.reading-tools` |
| 397–409 | Form `label`, `.field`, textarea, `.picker-results/.picker-item(.active/.dup)/.picker-empty`, `.shared-note`, `.cloud-note` |
| 410–430 | `.spread-item` rows (≤600 grid areas), `.orient` toggle (`.on`, `.nguoc.on`), `.rm`, `.spread-thumb`, `.pos-badge` |
| 431–434 | `.lightbox(.open)`, `img.flip` |
| 435–451 | `.reading-actions`, `.btn-primary`, `.ai-output` (markdown), `.thinking`, `.think-box`, `#chatFollow`, `#chatLog`, `.chat-q/.chat-a`, `.chat-input-row` |
| 452–457 | `#bgStars`, `#bgAura` (+`auraDrift`) |
| 458–467 | Card-back frame + `cardShine` sweep (`.flip-front`, `.riffle-card`, `.sff.front`); reduced-motion kills (incl. `.flame`, `.breathe-ring`) |
| 468–477 | `.moon-badge`, `.moon-svg(.sm)` |
| 478–501 | Ritual `.ritual-overlay/.ritual-box/.ritual-candle(.flame/.wick/.wax)/.ritual-breathe/.ritual-lead/.ritual-q/.ritual-actions/.ritual-off` |
| 502–510 | `.q-chips/.qchip`, `.reading-head`, `#ttsBtn`, `.ai-hint`, `.empty-spread`, `.spinner` |
| 512–526 | Modals `.modal-overlay(.open)`, `.modal`, `.hint`, `.provider-toggle(.on)`, `.modal-actions`, `.saved-note`, `.model-row` |
| 527–534 | `.deckbar`, **L531 `body[data-mode=browse|reading] #deckBar {display:none}`**, `.deck-inline`, `.picker-row` |
| 535–549 | History `.hist-head/.hist-item/.hist-tools/.hist-note-preview/.hist-note`, `#readingNote`, `.facts-box(.facts-static)` |
| 550–570 | AI floating cards `#aiSection(.bg-on)`, `.ai-cards-bg(.on/.thinking/.done)`, `.aibg-card(.lit)` |
| 571–580 | `.fallback-note`, `.chk-row`, `#spreadHint div`, `.hist-actions`, `.hist-detail(.open)`, `.hist-cards`, `.hist-empty` |
| 581–589 | Draw `.draw-controls`, `.draw-results`, `.draw-card`, `.draw-img`, `.draw-name`, `.orient-badge.xuoi/.nguoc` |
| 590–599 | `.corr-chips/.corr-chip.fire|water|air|earth|astro` |
| 600–612 | Sky `.sky-controls`, `.sky-stage(:fullscreen)`, `#skyCanvas(.grabbing)`, `.sky-tg.on`, `#skyZoomIn/Out` |
| 613–631 | Yes/No `.yesno-ask`, `.yesno-result(.show)`, `.yn-verdict.yes/.no/.maybe`, `.yn-card-name`, `.yn-why` |
| 632–637 | Site settings `.site-check`, `.site-vol`; **L637 `:root[data-fx=off] #bgAura,#bgStars {display:none}`** |
| 638–667 | Flip cards `.flip/.flip-inner/.flip-face/.flip-front/.flip-back(.noimg)`, `--cardback` default (L643), card-back picker `.cb-grid/.cb-opt(.on)/.cb-thumb/.cb-name`, `.spread-flip/.sfi/.sff`, `.draw-card.dealt` + `.draw-meta` (`dealIn`) |
| 668–685 | Riffle stage `.riffle(.on)`, `.riffle-card`, `@keyframes riffle` (unused; WAAPI drives it), ≤600, reduced motion; **dead `.shuffle-stage.on` (L684)** |
| 686–692 | Icons `.ico`, `button[data-ico]`, nav/qchip icon sizes |
| 693–759 | `--soft` easing; ≥1024 desktop dome nav (`.nav` sticky, `.nav-hidden`, `.nav-deco` arch/stars/dust, arched `--ay` items, hover sparkle `::after`, active ring `::before`, `.nav-sep`), ≤1279 compact; reduced motion |
| 760–811 | Card wheel `.fan(.spread/.reshuffle/.chosen/.locked)`, `.zwheel(.show)` rings, `.wcard(.picked)/.wbody`, `.fan-tools`, ≤600, reduced motion |
| 812–827 | `input[type=file]`; **≤980 responsive overrides** (single column, sticky reading actions, smaller padding, scrollable `.cards-list`) |

**Theme tokens:** `--bg --text --muted --panel --section --input --border --border2 --border3 --btn --accent --accent2 --aura1 --aura2 --star --spark`, plus `--cardback` (L643, JS-overridden) and `--soft` (L694). Component vars: `--cw --R --a --d --dl --drop --fa --fy --fs --z --j --fx --fr --od --ar --bw --w --ay --padT --icoS`.

**Themes:** default (dark purple, no attribute) · `night` · `rose` · `light`. Applied via `html[data-theme]` (inline bootstrap L833 + `initTheme` L5701, event `themechange`). `color-scheme` is dark/light. Many colours are hard-coded rather than tokenised (e.g. `button:hover #5a4a9b`, `.card-item rgba(66,57,97,.85)`, `.tab-btn:hover`, `.qchip`), with light-theme patches at L73–82, 186, 215, 307–308, 364, 568, 737.

**Breakpoints:**
- max-width 560, 600, 760, 860, 980 (also JS L1782), 1279 (inside ≥1024).
- min-width 600, 981, 1024 (also JS `navDesk` L1913).
- `prefers-reduced-motion: reduce` (CSS ×10 + JS `prefersReduced`/`reduceMotion`).
- `pointer: coarse` (JS only: tilt off, share sheet).
- `:fullscreen` / `:-webkit-full-screen`.

**Id/attribute coupling the React DOM must keep (or the CSS has to be rewritten):** `#landing`, `#bgStars`, `#bgAura`, `#deckBar`, `#spreadList`, `#spreadHint`, `#aiSection`, `#chatFollow`, `#chatLog`, `#readingNote`, `#interpretBtn`, `#ttsBtn`, `#skyCanvas`, `#skyZoomIn/#skyZoomOut`. `body[data-mode]`, `:root[lang]`, `:root[data-fx]`, `:root[data-theme]`, `[aria-checked]` on `.sp-tile`.

---

## 7. Cross-cutting

| Concern | Lines | Details |
|---|---|---|
| PWA install prompt | 2124–2133 | `beforeinstallprompt` → `preventDefault`, store `deferredPrompt`, show `#installBtn`, `layoutNavArc()`. Click → `prompt()`, await `userChoice`, hide, `closeNav`. `appinstalled` → hide. Manifest/meta L36–41 |
| Service worker | 5713–5716 | `navigator.serviceWorker.register('/sw.js')` on `window.load`, only for `http(s):`; errors swallowed |
| Theme bootstrap | 833, 5700–5710 | Inline pre-paint script reads `theme`. `initTheme` syncs `#themeSel`, applies the theme, dispatches `themechange` |
| Other root attrs | 2382–2388 | `initFx` and `initSky` set `html[data-fx|data-sky|data-skycity|data-skycompass]` during script parse. There is no inline bootstrap for fx, so this happens after first paint |
| SVG icon sprite | 832 | `<symbol>` ids: `i-home i-moon i-browse i-card i-ball i-planet i-scales i-hourglass i-gear i-sliders i-install i-heart i-wand i-coin i-compass i-eye i-shuffle i-pick i-rings` (19, all used through `ICON_OF`). Strokes use `currentColor` + `var(--spark)`. The logo SVG is inlined 3× (favicon data URI L35, landing L868, header L915) with distinct gradient ids (`…F/…L/…H`) |
| Toast / notice helpers | — | **No generic toast.** Uses native `alert()` (L3999, 4521, 4523, 4545), `confirm()` (L4440, 4449) and `prompt()` (L4063). Inline status lines: `#savedNote`, `#*ModelStatus`, `#readingNoteStatus`, `#pickStatus/#spreadPickStatus`, `#skyInfo`, `#askErr` (auto-hides after 2.6s), `.shared-note`, `.fallback-note`. Temporary button-text swaps (share link 2s, share image) |
| Focus / a11y | various | `sr-only` labels (reading). `role=radiogroup` + `role=radio aria-checked` spread tiles (**no arrow-key roving**). `aria-pressed` suit tiles. `aria-hidden` decorations. Hidden `<select tabindex=-1 aria-hidden>`. Focus moves: clear → search, add → picker input, chips → input, ask error → ask input. Desktop nav reappears on `focusin`. **No focus trap, no Esc handler and no focus return** for the drawer, modals, lightbox or ritual. Keyboard: picker ↑/↓/Enter/Esc; chat Enter/Shift+Enter; yes/no Enter; ask form submit. `html[lang]` is updated |
| Haptics / sparkle | 4128, 2118, 5785 | `haptic(ms)`; `burstAt(el,n)` → `window.tarotBurst` |
| Speech | 4115 | `speechSynthesis` (VI voice) |
| Network endpoints used by UI | — | `tarot.db`, `/card_en.json`, `/sky.json`, `/api/ai`, `/api/llm`, `/api/img?u=`, `/api/readings`, `/cardback.png`, `/cardback-witches.webp`, Google Fonts, cdnjs sql.js, `/_vercel/*` scripts |
| `window.*` globals | — | Explicit: `window.tarotBurst` (L5785). Custom window events: `themechange` (L5704), `skychange` (L2463, 2469). External: `initSqlJs` (CDN). Because this is a classic script, **every top-level `function` declaration (and `var aiBg`) is also a `window` property**; `let/const` are not. Nothing relies on that except the `typeof X === 'function'` guards (L1432, 1477, 1901, 2411) |
| Analytics | 5897, 5900 | Vercel Speed Insights + Web Analytics (`defer`) |

### Dead / suspicious code worth not porting
- `baseDecks` (L1500), `nextId()` (L4170), `tickTimer` (never set), `data-skycompass` (L2387).
- `@keyframes riffle` (L673, superseded by WAAPI), `.shuffle-stage.on` (L684).
- 8 dead EN keys (§5.3).
- The `questionInput` `input` dispatch in landing `go()` (no listener).
- The `<!-- IMPORT DECK MODAL -->` comment with no modal (L1339).
- `setSoundOn` L4748 dereferences `b.style` outside its null guard.
- Background real-sky constellation lines are broken (§4.1).
