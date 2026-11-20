# Plan 2b: parity with legacy

Run on 2026-11-20 against the frozen legacy copy (`witches_tarot.html`). Both apps used the real card data.

## Screenshots (`node scripts/parity-screens.mjs <filter>`)

These variants were captured: phone 390×844 and desktop 1440×900, VI and EN, dark and light. Percentages are the share of pixels that differ.

| Screen | Range | Verdict |
|---|---|---|
| History (empty) | 0.00% on all 8 variants | identical |
| AI Reading (empty) | 0.00% (phone), 0.45–0.57% (desktop) | the only diff is the step-3 buttons, renamed per §5.8 |
| AI Reading with 3 cards (Past/Present/Future added by hand) | 1.8–6.2% | the diff is limited to the step-3 buttons (§5.8). In EN the new labels are wider, so the "Cards" field wraps to its own row. The board, card list, chips, facts and buttons are identical. |
| Yes/No (empty) | 0–2.6% | a 1 px vertical shift from the `<input>` height that Chrome measured before the web font loaded. This is the same noise as the `<select>` in Plan 2a. |

**Not compared:**
- `/boc-bai` (Draw) intentionally differs from legacy (spec §5.8).
- Screens that need random draws or AI answers are covered by the browser flow check below instead.

## Real-browser flows (`node scripts/smoke-flows.mjs`)

Chrome via Playwright, with the real `tarot.db`. `/api/ai` is mocked with `page.route`, which uses no free-AI quota. Every step passes:

1. **Draw:** pick the Past/Present/Future spread, pick the cards by hand on the wheel. The cards land on the numbered board, and the meanings are labelled with their positions.
2. **Send to AI Reading:** the spread type and all 3 cards carry over.
3. **Interpret:**
   - the answer streams in as markdown;
   - the box shows "Còn 4 lượt miễn phí hôm nay";
   - the journal note box appears.
4. **Follow-up question:** the answer appears in the chat.
5. **Share link:** the `#r=` link is copied.
6. **Open the link in a new tab:** the question, 3 cards, answer and warning note are all correct.
7. **Journal:** the reading is listed. "Tải lại" reopens it.
8. **Yes/No:** AI gives the verdict "CÓ" with class `yes`.
9. **Full animations (no reduced motion):** shuffle → stop → automatic draw → flip → deal onto the board → the list appears.
10. No JS or console errors.

## Gaps found and fixed during this task

- The legacy `initIcons` icons were missing on the question chips (both screens), `#yesnoBtn`, `#interpretBtn` and `#drawToReading`. They now have `data-ico`, the SVG and the label without its leading glyph.
- In the smoke test itself, the lower half of each wheel card is clipped by the frame (legacy design), so the test clicks through the DOM.

## Intentional differences from legacy (rulings recorded in the ledger)

- **Draw tab:** redesigned per §5.8.
- **Step-3 buttons on both screens:** "🎲 Máy bốc ngẫu nhiên" and "✋ Tự tay chọn lá", each with a hint line.
- **Bug fixes:**
  - **Random draw could hang:** "Xào & bốc" could pick the same card twice, so the wheel never finished. Each pick now comes from its own segment of the wheel.
  - **Draw with reduced motion:** the random draw never ran when reduced motion was on.
  - **Share sheet:** cancelling it no longer falls back to copying the link or downloading the image.
  - **Yes/No error text:** no longer escaped twice.
- **Robustness:**
  - **Cancelled AI requests:** a request that is superseded or left behind is cancelled with an AbortSignal and does not fall back to another provider.
  - **Journal notes:** a pending note save cannot bring back a deleted record or overwrite a follow-up.
  - **Imported journals:** malformed imports are normalised, so the journal screen cannot crash.
  - **Shared links:** a link opened while the DB is still loading waits for it.
