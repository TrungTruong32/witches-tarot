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
import type { ChatMessage, FreeAiInfo, ProviderCtx, ProviderId } from '../../services/ai/providers';
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

/** Mỗi lần diễn giải mới tăng phiên → lượt hỏi tiếp của trải bài cũ còn đang chạy không ghi vào trải bài mới. */
let session = 0;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function providerCtx(cards: SpreadCard[]): ProviderCtx {
  const app = useApp.getState();
  return { settings: app.aiSettings, lang: app.lang, deck: readingDecks(cards).join(', ') || app.deck || '' };
}

/**
 * streamInto của bản cũ: gọi AI, đẩy từng bước vào `onView`. Trả về chữ trả lời ('' nếu AI không trả gì) + provider đã trả lời.
 * Lỗi được ném lại cho nơi gọi (mỗi nơi hiện câu lỗi riêng).
 */
export async function streamInto(
  messages: ChatMessage[],
  onView: (v: StreamView) => void,
  chat: typeof chatComplete,
  ctx: ProviderCtx,
): Promise<{ text: string; result: ChatResult; view: StreamView }> {
  let v = connectingView();
  const emit = (next: StreamView) => { v = next; onView(v); };
  emit(v);
  const result = await chat(messages, {
    onToken: t => emit({ ...v, status: 'streaming', text: v.text + t }),
    // Đã có chữ trả lời: suy nghĩ đến muộn chỉ cộng dồn, hiện ở lần vẽ kế (khung suy nghĩ đã gập) — như bản cũ
    onReasoning: t => {
      const reasoning = v.reasoning + t;
      if (v.text) v = { ...v, reasoning };
      else if (reasoning) emit({ ...v, reasoning, status: 'thinking' });
    },
    // Chuyển provider: bỏ suy nghĩ của provider vừa lỗi, quay về "Đang kết nối…" kèm dòng báo dự phòng
    onSwitch: () => emit({ ...v, status: 'connecting', reasoning: '', switched: true }),
  }, ctx);
  emit(v.text ? { ...v, status: 'done' } : { ...v, status: 'empty' });
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
    saved = record;
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
  const my = ++session;
  const live = () => my === session; // false = đã mở lời giải khác (showLoadedAnswer) trong lúc AI đang trả lời
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

  patch({ running: true, chatOpen: false, follows: [], chatBusy: false, tts: false, quotaFrom: null, main: connectingView(), noteStatus: { kind: 'idle' } });
  r.setCurrent(null);
  r.setFollowups([]);
  r.setMessages(messages);
  r.setAiBg('thinking');
  cancelSpeech();
  requestAnimationFrame(() =>
    document.getElementById('resultPanel')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
  );

  try {
    const { text, result } = await streamInto(messages, v => live() && patch({ main: v }), d.chat, providerCtx(cards));
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
    useReading.getState().setCurrent(saved);
    patch({ chatOpen: true, tts: true, share: true });
  } catch (e) {
    if (!live()) return;
    // Giữ dòng "đã chuyển provider" (switched), bỏ phần đã stream: khung chỉ còn câu lỗi
    const main = useInterpret.getState().main ?? connectingView();
    patch({ main: { ...main, status: 'error', text: '', reasoning: '', error: interpretError(errMsg(e)) } });
  } finally {
    patch({ running: false });
    if (live()) useReading.getState().setAiBg('done');
  }
}

/** sendFollow: hỏi tiếp trong cùng ngữ cảnh trải bài; có trả lời thì ghi vào followups của bản ghi nhật ký. */
export async function runFollowUp(question: string, deps: InterpretDeps = {}): Promise<void> {
  const d = withDefaults(deps);
  const q = question.trim();
  const r = useReading.getState();
  if (!q || !r.messages.length || useInterpret.getState().chatBusy) return;
  const my = session;
  const messages: ChatMessage[] = [...r.messages, { role: 'user', content: q }];
  const idx = useInterpret.getState().follows.length;
  const setView = (v: StreamView) => {
    if (my !== session) return;
    const follows = useInterpret.getState().follows.slice();
    if (follows[idx]) follows[idx] = { q, view: v };
    patch({ follows });
  };
  patch({ chatBusy: true, follows: [...useInterpret.getState().follows, { q, view: connectingView() }] });
  r.setMessages(messages);
  r.setAiBg('thinking');
  try {
    const { text } = await streamInto(messages, setView, d.chat, providerCtx(r.cards));
    if (my !== session) return;
    const st = useReading.getState();
    if (!text) {
      st.setMessages(messages.slice(0, -1)); // bỏ câu hỏi nếu không có trả lời
      return;
    }
    st.setMessages([...messages, { role: 'assistant', content: text }]);
    const followups = [...st.followups, { q, a: text }];
    st.setFollowups(followups);
    const cur = st.current;
    if (cur) {
      const next: Reading = { ...cur, followups: [...(cur.followups || []), { q, a: text }] };
      st.setCurrent(next);
      try {
        await d.update(next);
      } catch {
        /* như bản cũ: lỗi lưu hỏi-tiếp bỏ qua */
      }
    }
  } catch (e) {
    if (my !== session) return;
    setView({ ...connectingView(), status: 'error', error: '⚠️ Lỗi: ' + errMsg(e) });
    useReading.getState().setMessages(messages.slice(0, -1));
  } finally {
    if (my === session) {
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
  const next: Reading = { ...reading, note: value };
  if (id == null) return next;
  const st = useReading.getState();
  if (st.current?.id === id) st.setCurrent({ ...st.current, note: value });
  patch({ noteStatus: { kind: 'saving' } });
  clearTimeout(noteTimers.get(id));
  noteTimers.set(id, setTimeout(async () => {
    noteTimers.delete(id);
    // Lưu bản mới nhất (có thể đã thêm hỏi-tiếp trong lúc chờ)
    const cur = useReading.getState().current;
    const rec = cur?.id === id ? cur : next;
    try {
      await update(rec);
      patch({ noteStatus: { kind: 'saved' } });
    } catch (e) {
      patch({ noteStatus: { kind: 'failed', msg: errMsg(e) } });
    }
  }, 500));
  return next;
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
  ++session; // hỏi-tiếp đang chạy của trải bài trước không được ghi vào bản này
  const r = useReading.getState();
  patch({
    main: { status: 'done', text, reasoning: '', switched: false },
    follows: [], chatOpen: false, chatBusy: false, share: true, noteStatus: { kind: 'idle' },
  });
  r.setAnswer(text);
  r.setMessages([]);
  r.setFollowups([]);
  r.setCurrent(record && record.id != null ? record : null);
  r.setAiBg(text && r.cards.length ? 'done' : 'off');
}
