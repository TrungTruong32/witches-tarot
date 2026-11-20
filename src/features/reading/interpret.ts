// Diễn giải AI cho "Trải bài AI" (interpret / sendFollow / saveReading / saveNoteDebounced của bản cũ, L3669–3855, L4238–4373).
// Hàm async thuần + store nhỏ cho phần hiển thị: chạy và test được không cần React; ResultPanel chỉ vẽ lại từ store.
// Phụ thuộc bên ngoài (gọi AI, IndexedDB, lưu máy chủ) tiêm qua `deps` để test thay bằng bản giả.
import { create } from 'zustand';
import { useApp } from '../../app/store';
import { computeSpreadFacts, factLines } from '../../core/facts';
import { buildSystemPrompt, buildUserPrompt, readingDecks } from '../../core/prompt';
import type { Lang, Reading, SpreadCard } from '../../core/types';
import { prefersReducedMotion } from '../../lib/media';
import { chatComplete, providerChain, type ChatResult } from '../../services/ai/chat';
import { providerLabel } from '../../services/ai/models';
import { isAbortError, type ChatMessage, type FreeAiInfo, type ProviderCtx, type ProviderId } from '../../services/ai/providers';
import { addReading, updateReading } from '../../services/idb';
import { cloudSaveReading } from '../../services/readingsApi';
import type { AiSettings } from '../../services/storage';
import { majorNameLookup, positionsFor, useReading } from './readingStore';

// ---------- trạng thái một khung trả lời đang stream ----------

/**
 * - connecting: chưa có gì (spinner "Đang kết nối…"); thinking: mới có suy nghĩ (reasoning) của AI;
 * - streaming/done: đã có chữ trả lời; error: lỗi (error = câu hiển thị); empty: AI không trả về chữ nào.
 */
export type StreamStatus = 'connecting' | 'thinking' | 'streaming' | 'done' | 'error' | 'empty';
export interface StreamView {
  status: StreamStatus;
  text: string;
  reasoning: string;
  /** Đã tự chuyển sang provider dự phòng (hiện .fallback-note). */
  switched: boolean;
  error?: string;
}
export const connectingView = (): StreamView => ({ status: 'connecting', text: '', reasoning: '', switched: false });

/** Lượt hỏi tiếp: câu hỏi + khung trả lời của nó. */
export interface FollowView {
  q: string;
  view: StreamView;
}

export type NoteStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; msg: string };

export interface InterpretState {
  /** Khung lời giải chính; null = dòng gợi ý ban đầu ("Viết câu hỏi…"). */
  main: StreamView | null;
  follows: FollowView[];
  /** Đang diễn giải → khoá #interpretBtn. */
  running: boolean;
  /** Đang hỏi tiếp → khoá #chatSend. */
  chatBusy: boolean;
  /** #chatFollow hiện (sau khi diễn giải xong có lời giải). */
  chatOpen: boolean;
  /** #ttsBtn hiện. */
  tts: boolean;
  /** #shareImgBtn / #shareLinkBtn hiện (Task 8 gắn xử lý). */
  share: boolean;
  /** Provider cho #aiQuota (updateProviderLabel(p)); null = provider đầu chuỗi theo cài đặt. */
  quotaFrom: ProviderId | null;
  /** freeAiInfo của bản cũ: model + lượt còn lại của AI miễn phí ở lượt gần nhất. */
  free: FreeAiInfo;
  noteStatus: NoteStatus;
  /** Lời giải mở từ link chia sẻ → hiện .shared-note ở đầu #aiOutput (loadSharedFromHash L4097). */
  sharedNote: boolean;
}

export function initialInterpret(): InterpretState {
  return {
    main: null,
    follows: [],
    running: false,
    chatBusy: false,
    chatOpen: false,
    tts: false,
    share: false,
    quotaFrom: null,
    free: { model: '', remaining: null },
    noteStatus: { kind: 'idle' },
    sharedNote: false,
  };
}

export const useInterpret = create<InterpretState>()(() => initialInterpret());
const patch = (p: Partial<InterpretState>) => useInterpret.setState(p);

// ---------- phụ thuộc tiêm được ----------

export interface InterpretDeps {
  chat?: typeof chatComplete;
  save?: typeof addReading;
  update?: typeof updateReading;
  cloud?: typeof cloudSaveReading;
}
const withDefaults = (d: InterpretDeps) => ({
  chat: d.chat ?? chatComplete,
  save: d.save ?? addReading,
  update: d.update ?? updateReading,
  cloud: d.cloud ?? cloudSaveReading,
});

/**
 * Phiên = một lời giải đang mở. Diễn giải mới / mở lời giải khác (showLoadedAnswer) tăng phiên và huỷ (abort) mọi lượt gọi AI
 * của phiên cũ: lượt hỏi tiếp cũ không được ghi vào giao diện / hội thoại của lời giải mới.
 */
let session = 0;
let sessionAbort = new AbortController();
function newSession(): { id: number; signal: AbortSignal } {
  sessionAbort.abort();
  sessionAbort = new AbortController();
  return { id: ++session, signal: sessionAbort.signal };
}

/**
 * Bản ghi nhật ký mới nhất theo id. Lưu lời giải, hỏi tiếp và ghi chú đều đi qua đây, nên hẹn giờ ghi chú (500 ms)
 * hay lượt hỏi tiếp đã bị thay thế luôn ghi đè lên bản đầy đủ nhất — không bao giờ làm mất phần kia.
 */
const latest = new Map<number, Reading>();
function remember(r: Reading): Reading {
  if (r.id != null) latest.set(r.id, r);
  return r;
}
const latestOf = (r: Reading): Reading => (r.id != null ? latest.get(r.id) ?? r : r);

/**
 * Bản ghi đã xoá ở màn Lịch sử: hỏi-tiếp / ghi chú đang dở của chúng không được ghi lại vào IndexedDB
 * (updateReading là put — ghi vào id đã xoá sẽ tạo lại bản ghi). Xoá một bản → `forgotten`; xoá hết → tăng `clearEpoch`,
 * mọi lượt bắt đầu trước đó (kể cả bản ghi lưu sau khi lượt đó bắt đầu) đều coi như đã xoá.
 * IndexedDB autoIncrement không dùng lại id, nên giữ id trong `forgotten` là an toàn.
 */
const forgotten = new Set<number>();
let clearEpoch = 0;
/** Bản ghi `id` (lượt bắt đầu ở `epoch`) đã bị xoá → không được ghi lại. */
const gone = (id: number | undefined, epoch: number) => epoch !== clearEpoch || (id != null && forgotten.has(id));

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function providerCtx(cards: SpreadCard[], signal: AbortSignal): ProviderCtx {
  const app = useApp.getState();
  return { settings: app.aiSettings, lang: app.lang, deck: readingDecks(cards).join(', ') || app.deck || '', signal };
}

/** Lượt gọi bị huỷ vì đã sang phiên khác — im lặng, không báo lỗi. */
const aborted = (e: unknown, signal: AbortSignal) => isAbortError(e) || signal.aborted;

/** Gộp các lần vẽ trong một khung hình (rAF); không có rAF thì vẽ ngay. */
function frameBatcher(flush: () => void): { schedule(): void; cancel(): void } {
  let scheduled = false;
  let id = 0;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  return {
    schedule() {
      if (!raf) return flush();
      if (scheduled) return;
      scheduled = true; // đặt trước khi gọi: rAF chạy đồng bộ (test) vẫn đúng
      id = raf(() => {
        scheduled = false;
        flush();
      });
    },
    cancel() {
      if (scheduled && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      scheduled = false;
    },
  };
}

/**
 * streamInto của bản cũ: gọi AI, đẩy từng bước vào `onView`. Trả về chữ trả lời ('' nếu AI không trả gì) + provider đã trả lời.
 * Chữ / suy nghĩ cộng dồn ngay nhưng chỉ vẽ tối đa một lần mỗi khung hình (rAF); trạng thái cuối luôn vẽ ngay khi stream xong.
 * Lỗi được ném lại cho nơi gọi (mỗi nơi hiện câu lỗi riêng); khi đó lần vẽ đang chờ bị huỷ.
 */
export async function streamInto(
  messages: ChatMessage[],
  onView: (v: StreamView) => void,
  chat: typeof chatComplete,
  ctx: ProviderCtx,
): Promise<{ text: string; result: ChatResult; view: StreamView }> {
  let v = connectingView();
  const frame = frameBatcher(() => onView(v));
  const now = (next: StreamView) => { frame.cancel(); v = next; onView(v); };
  const later = (next: StreamView) => { v = next; frame.schedule(); };
  now(v);
  let result: ChatResult;
  try {
    result = await chat(messages, {
      onToken: t => later({ ...v, status: 'streaming', text: v.text + t }),
      // Đã có chữ trả lời: suy nghĩ đến muộn chỉ cộng dồn, hiện ở lần vẽ kế (khung suy nghĩ đã gập) — như bản cũ
      onReasoning: t => {
        const reasoning = v.reasoning + t;
        if (v.text) v = { ...v, reasoning };
        else if (reasoning) later({ ...v, reasoning, status: 'thinking' });
      },
      // Chuyển provider: bỏ suy nghĩ của provider vừa lỗi, quay về "Đang kết nối…" kèm dòng báo dự phòng
      onSwitch: () => now({ ...v, status: 'connecting', reasoning: '', switched: true }),
    }, ctx);
  } catch (e) {
    frame.cancel();
    throw e;
  }
  now(v.text ? { ...v, status: 'done' } : { ...v, status: 'empty' });
  return { text: v.text, result, view: v };
}

// ---------- lưu nhật ký ----------

/** Những gì bản ghi nhật ký cần, chụp lúc bấm Diễn giải (đổi trải bài trong lúc AI trả lời không làm lệch bản ghi). */
export interface ReadingSnapshot {
  question: string;
  cards: SpreadCard[];
  spreadKey: string;
}

export function snapshotReading(): ReadingSnapshot {
  const { question, cards, spreadKey } = useReading.getState();
  return { question, cards, spreadKey };
}

/** Bản ghi nhật ký đúng dạng saveReading của bản cũ (L4238). AI miễn phí lưu "free · <model>", provider khác lưu providerLabel. */
export function buildReadingRecord(snap: ReadingSnapshot, text: string, result: ChatResult, free: FreeAiInfo): Reading {
  const app = useApp.getState();
  const { cards, spreadKey } = snap;
  const positions = positionsFor({ spreadKey }, app.lang);
  return {
    ts: Date.now(),
    deck: readingDecks(cards).join(', ') || app.deck || '',
    question: snap.question.trim(),
    provider: result.provider === 'free' ? 'free · ' + (free.model || '?') : providerLabel(result.provider, app.aiSettings, app.lang),
    text,
    followups: [],
    note: '',
    spread: spreadKey,
    positions: positions ? positions.slice() : null,
    facts: cards.length >= 2 ? factLines(cards, computeSpreadFacts(cards), app.lang, majorNameLookup(app.db, cards)) : [],
    cards: cards.map(c => ({
      id: c.id, deck: c.deck, ten: c.ten, bo: c.bo, so: c.so, y_nghia_xuoi: c.y_nghia_xuoi, nghia_nguoc: c.nghia_nguoc,
      tu_khoa: c.tu_khoa, image_url: c.image_url, orientation: c.orientation,
    })),
  };
}

/** Lưu IndexedDB (lỗi → không gắn bản ghi hiện tại), rồi luôn gọi lưu máy chủ — service tự kiểm tra cài đặt "lưu ẩn danh". */
async function saveReading(record: Reading, d: ReturnType<typeof withDefaults>): Promise<Reading | null> {
  let saved: Reading | null = null;
  try {
    await d.save(record);
    if (record.id != null) forgotten.delete(record.id); // id mới (IDB mới trong test có thể cấp lại id cũ)
    saved = remember(record);
  } catch (e) {
    console.warn('Lưu lịch sử thất bại', e);
  }
  d.cloud(record, useApp.getState().lang);
  return saved;
}

// ---------- diễn giải ----------

const MODEL_HINT =
  '\n\n→ Model này không dùng được cho tài khoản của bạn (thường tài khoản mới chỉ có thế hệ mới nhất). Mở “Cài đặt AI”, bấm “Kiểm tra & tải model” và chọn model ở đầu danh sách (ví dụ gemini-flash-latest hoặc gemini-3.1-flash-lite), rồi Lưu.';

/** Câu lỗi của khung chính (kèm hướng dẫn đổi model khi lỗi là "model không tồn tại"). */
export function interpretError(message: string): string {
  let m = '⚠️ Lỗi: ' + message;
  if (/no longer available|not found|not supported|NOT_FOUND|deprecated/i.test(message)) m += MODEL_HINT;
  return m;
}

function cancelSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* trình duyệt không có TTS */
  }
}

/** Bấm "Diễn giải": dựng prompt, stream lời giải, lưu nhật ký, mở ô hỏi tiếp. */
export async function runInterpret(deps: InterpretDeps = {}): Promise<void> {
  const d = withDefaults(deps);
  const r = useReading.getState();
  const app = useApp.getState();
  const snap = snapshotReading();
  const { cards } = snap;
  if (!cards.length || useInterpret.getState().running) return;
  const { id: my, signal } = newSession();
  const live = () => my === session; // false = đã mở lời giải khác (showLoadedAnswer) trong lúc AI đang trả lời
  const epoch = clearEpoch;
  const decks = readingDecks(cards);
  const deckLabel = decks.length ? decks.join(', ') : app.deck || 'Tarot';
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(app.lang, deckLabel) },
    {
      role: 'user',
      content: buildUserPrompt({
        question: snap.question, cards, spreadKey: snap.spreadKey, positions: positionsFor(snap, app.lang), lang: app.lang,
        cardEn: app.cardEn, majorName: majorNameLookup(app.db, cards),
      }),
    },
  ];

  patch({ running: true, chatOpen: false, follows: [], chatBusy: false, tts: false, quotaFrom: null, main: connectingView(), noteStatus: { kind: 'idle' }, sharedNote: false });
  r.setCurrent(null);
  r.setFollowups([]);
  r.setMessages(messages);
  r.setAiBg('thinking');
  cancelSpeech();
  requestAnimationFrame(() =>
    document.getElementById('resultPanel')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
  );

  try {
    const { text, result } = await streamInto(messages, v => live() && patch({ main: v }), d.chat, providerCtx(cards, signal));
    if (!text) return;
    const free = result.free ?? useInterpret.getState().free;
    const record = buildReadingRecord(snap, text, result, free);
    if (live()) {
      patch({ quotaFrom: result.provider, free });
      const st = useReading.getState();
      st.setProvider(result.provider);
      st.setMessages([...messages, { role: 'assistant', content: text }]);
      st.setAnswer(text);
    }
    const saved = await saveReading(record, d);
    if (!live()) return;
    // Lịch sử bị xoá hết trong lúc đang lưu → không gắn bản ghi (hỏi-tiếp / ghi chú sau đó không ghi lại nó)
    useReading.getState().setCurrent(saved && !gone(saved.id, epoch) ? saved : null);
    patch({ chatOpen: true, tts: true, share: true });
  } catch (e) {
    if (!live() || aborted(e, signal)) return; // huỷ vì sang lời giải khác: không báo lỗi, không lưu
    // Giữ dòng "đã chuyển provider" (switched), bỏ phần đã stream: khung chỉ còn câu lỗi
    const main = useInterpret.getState().main ?? connectingView();
    patch({ main: { ...main, status: 'error', text: '', reasoning: '', error: interpretError(errMsg(e)) } });
  } finally {
    patch({ running: false });
    if (live()) useReading.getState().setAiBg('done');
  }
}

/**
 * sendFollow: hỏi tiếp trong cùng ngữ cảnh trải bài; có trả lời thì ghi vào followups của bản ghi nhật ký.
 * Bản ghi được chụp trước khi gọi AI: lượt đã bị thay thế (diễn giải mới) mà vẫn có câu trả lời thì vẫn lưu vào đúng
 * bản ghi của nó, chỉ không đụng tới giao diện / hội thoại của lời giải mới. Bị huỷ (abort) thì bỏ qua im lặng.
 */
export async function runFollowUp(question: string, deps: InterpretDeps = {}): Promise<void> {
  const d = withDefaults(deps);
  const q = question.trim();
  const r = useReading.getState();
  if (!q || !r.messages.length || useInterpret.getState().chatBusy) return;
  const my = session;
  const signal = sessionAbort.signal;
  const live = () => my === session;
  const owner = r.current; // bản ghi nhật ký của lượt này
  const epoch = clearEpoch;
  const messages: ChatMessage[] = [...r.messages, { role: 'user', content: q }];
  const idx = useInterpret.getState().follows.length;
  const setView = (v: StreamView) => {
    if (!live()) return;
    const follows = useInterpret.getState().follows.slice();
    if (follows[idx]) follows[idx] = { q, view: v };
    patch({ follows });
  };
  patch({ chatBusy: true, follows: [...useInterpret.getState().follows, { q, view: connectingView() }] });
  r.setMessages(messages);
  r.setAiBg('thinking');
  try {
    const { text } = await streamInto(messages, setView, d.chat, providerCtx(r.cards, signal));
    if (live()) {
      const st = useReading.getState();
      if (!text) {
        st.setMessages(messages.slice(0, -1)); // bỏ câu hỏi nếu không có trả lời
        return;
      }
      st.setMessages([...messages, { role: 'assistant', content: text }]);
      st.setFollowups([...st.followups, { q, a: text }]);
    }
    if (!text || !owner || gone(owner.id, epoch)) return; // bản ghi đã bị xoá trong lúc AI trả lời: không ghi lại
    const base = latestOf(owner);
    const next = remember({ ...base, followups: [...(base.followups || []), { q, a: text }] });
    if (live()) useReading.getState().setCurrent(next);
    try {
      await d.update(next);
    } catch {
      /* như bản cũ: lỗi lưu hỏi-tiếp bỏ qua */
    }
  } catch (e) {
    if (!live() || aborted(e, signal)) return;
    setView({ ...connectingView(), status: 'error', error: '⚠️ Lỗi: ' + errMsg(e) });
    useReading.getState().setMessages(messages.slice(0, -1));
  } finally {
    if (live()) {
      patch({ chatBusy: false });
      useReading.getState().setAiBg('done');
      document.querySelectorAll('#chatLog .chat-a')[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ---------- ghi chú nhật ký ----------

const noteTimers = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * saveNoteDebounced: ghi chú lưu sau 500 ms ngừng gõ. Trả về bản ghi đã gắn ghi chú; cùng id với bản ghi đang mở
 * thì cập nhật luôn bản đó, để lần hỏi-tiếp sau không ghi đè mất ghi chú. Hẹn giờ không gắn với component:
 * rời màn trước 500 ms ghi chú vẫn được lưu.
 */
export function saveNoteDebounced(reading: Reading, value: string, update: typeof updateReading = updateReading): Reading {
  const id = reading.id;
  const epoch = clearEpoch;
  if (id == null || gone(id, epoch)) return { ...reading, note: value };
  const next = remember({ ...latestOf(reading), note: value });
  const st = useReading.getState();
  // Trạng thái chung chỉ thuộc ô ghi chú của bản ghi đang mở (ô ở Lịch sử tự hiện trạng thái riêng)
  if (st.current?.id === id) {
    st.setCurrent(next);
    patch({ noteStatus: { kind: 'saving' } });
  }
  clearTimeout(noteTimers.get(id));
  noteTimers.set(id, setTimeout(async () => {
    noteTimers.delete(id);
    if (gone(id, epoch)) return;
    // Lưu bản mới nhất (có thể đã thêm hỏi-tiếp trong lúc chờ, kể cả khi bản ghi đã không còn mở)
    // Trạng thái chỉ báo cho ô ghi chú của chính bản ghi này (đã mở bản khác thì thôi)
    const status = (st: NoteStatus) => useReading.getState().current?.id === id && patch({ noteStatus: st });
    try {
      await update(latest.get(id) ?? next);
      status({ kind: 'saved' });
    } catch (e) {
      status({ kind: 'failed', msg: errMsg(e) });
    }
  }, 500));
  return next;
}

/**
 * Gọi TRƯỚC khi xoá bản ghi `id` khỏi IndexedDB: huỷ ghi chú đang chờ, chặn hỏi-tiếp đang dở ghi lại nó.
 * Trả về hàm hoàn tác (xoá thất bại → bản ghi vẫn còn, ghi chú / hỏi-tiếp lưu tiếp như thường).
 */
export function forgetReading(id: number | undefined): () => void {
  if (id == null) return () => {};
  clearTimeout(noteTimers.get(id));
  noteTimers.delete(id);
  latest.delete(id);
  forgotten.add(id);
  return () => { forgotten.delete(id); };
}

/** Như forgetReading cho mọi bản ghi (Xóa toàn bộ lịch sử), kể cả bản ghi chưa biết id tại lúc này. */
export function forgetAllReadings(): () => void {
  noteTimers.forEach(t => clearTimeout(t));
  noteTimers.clear();
  latest.clear();
  const prev = { epoch: clearEpoch, ids: [...forgotten] };
  forgotten.clear(); // clearEpoch đã phủ mọi id cũ
  clearEpoch++;
  return () => {
    clearEpoch = prev.epoch;
    prev.ids.forEach(i => forgotten.add(i));
  };
}

export function noteStatusText(s: NoteStatus, lang: Lang): string {
  const en = lang === 'en';
  if (s.kind === 'saving') return en ? 'Saving…' : 'Đang lưu…';
  if (s.kind === 'saved') return en ? '✓ Saved' : '✓ Đã lưu';
  if (s.kind === 'failed') return (en ? '⚠️ Save failed: ' : '⚠️ Lưu thất bại: ') + s.msg;
  return '';
}

// ---------- #aiQuota (updateProviderLabel) ----------

/** Chữ #aiQuota, hoặc null khi ẩn (chỉ hiện khi đang dùng AI miễn phí và biết số lượt còn lại). */
export function quotaText(s: Pick<InterpretState, 'quotaFrom' | 'free'>, settings: AiSettings, lang: Lang): string | null {
  const p = s.quotaFrom ?? providerChain(settings)[0];
  if (p !== 'free' || s.free.remaining == null) return null;
  return lang === 'en' ? `${s.free.remaining} free readings left today` : `Còn ${s.free.remaining} lượt miễn phí hôm nay`;
}

// ---------- mở lại lời giải đã có (Task 8: lịch sử / link chia sẻ) ----------

/**
 * Phần khung lời giải của loadReading (L4314): hiện `text` như đã stream xong, hiện nút chia sẻ, bỏ hội thoại hỏi-tiếp cũ.
 * `record` có id (từ lịch sử) → gắn để ghi chú tiếp; từ link chia sẻ thì truyền null. Gọi SAU khi đã setCards.
 */
export function showLoadedAnswer(text: string, record: Reading | null): void {
  newSession(); // huỷ lượt gọi AI của lời giải trước; hỏi-tiếp cũ không được ghi vào giao diện của bản này
  const r = useReading.getState();
  patch({
    main: { status: 'done', text, reasoning: '', switched: false },
    follows: [], chatOpen: false, chatBusy: false, share: true, noteStatus: { kind: 'idle' }, sharedNote: false,
  });
  r.setAnswer(text);
  r.setMessages([]);
  r.setFollowups([]);
  r.setCurrent(record && record.id != null ? remember(record) : null);
  r.setAiBg(text && r.cards.length ? 'done' : 'off');
}
