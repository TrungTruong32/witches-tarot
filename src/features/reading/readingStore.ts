// Trạng thái màn "Trải bài AI" (Zustand riêng, không nằm trong useApp). Không lưu xuống storage —
// rời màn rồi quay lại vẫn còn (bản cũ chỉ ẩn view). Màn "Bốc bài" có store riêng (features/draw/drawStore).
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { defsFor } from '../../core/spreads';
import { toSpreadCard } from '../../core/draw';
import type { Card, Orientation, Reading as ReadingRecord, SpreadCard } from '../../core/types';
import type { ChatMessage } from '../../services/ai/providers';

export type Reveal = 'none' | 'seq' | 'deal';
export type AiBg = 'off' | 'thinking' | 'done';

export interface ReadingState {
  question: string;
  spreadKey: string;
  /** Lá trong trải bài (mỗi lá có uid — đi qua toSpreadCard). Giữ nguyên mảng khi không đổi: SpreadBoard dựng lại khi mảng đổi. */
  cards: SpreadCard[];
  /** Cách hiện lá lần vẽ tới: 'seq' = renderSpread(true) (lật lần lượt ở danh sách), 'deal' = chia vào bàn, 'none' = hiện sẵn. */
  reveal: Reveal;
  answer: string;
  provider: string | null;
  messages: ChatMessage[];
  followups: { q: string; a: string }[];
  current: ReadingRecord | null;
  aiBg: AiBg;
  /**
   * Ô "Số lá" (chuỗi như ô nhập). Kiểu trải cố định khoá theo số vị trí (applySpreadType của bản cũ);
   * về Tự do vẫn giữ số vừa khoá. Nằm trong store để rời màn rồi quay lại không bị đặt lại về 3.
   */
  drawCount: string;
  setQuestion(q: string): void;
  /** Đổi kiểu trải (kể cả từ ngoài: link chia sẻ, Lịch sử, "Đưa sang Trải bài AI"); kiểu cố định khoá drawCount. */
  setSpreadKey(k: string): void;
  setDrawCount(v: string): void;
  setCards(c: SpreadCard[], reveal?: Reveal): void;
  /** Thêm một lá từ DB (Xuôi). false = kiểu trải cố định đã đủ lá. */
  addCard(c: Card): boolean;
  removeCard(uid: number): void;
  setOrientation(uid: number, o: Orientation): void;
  /** Nút "Xóa trải bài": bỏ hết lá, tắt nền lá-trôi. */
  clear(): void;
  setReveal(r: Reveal): void;
  setAnswer(a: string): void;
  setProvider(p: string | null): void;
  setMessages(m: ChatMessage[]): void;
  setFollowups(f: { q: string; a: string }[]): void;
  setCurrent(r: ReadingRecord | null): void;
  setAiBg(m: AiBg): void;
}

type Data = Pick<ReadingState,
  'question' | 'spreadKey' | 'cards' | 'reveal' | 'answer' | 'provider' | 'messages' | 'followups' | 'current' | 'aiBg' | 'drawCount'>;

/** Trạng thái ban đầu (dùng để reset trong test). */
export function initialReading(): Data {
  return {
    question: '',
    spreadKey: 'free',
    cards: [],
    reveal: 'none',
    answer: '',
    provider: null,
    messages: [],
    followups: [],
    current: null,
    aiBg: 'off',
    drawCount: '3',
  };
}

// Mọi thay đổi trải bài = renderSpread() không đối số của bản cũ → lá hiện sẵn (reveal 'none').
export const useReading: UseBoundStore<StoreApi<ReadingState>> = create<ReadingState>()((set, get) => ({
  ...initialReading(),
  setQuestion: q => set({ question: q }),
  setSpreadKey: k => {
    const pos = defsFor(k, 'vi');
    set(pos ? { spreadKey: k, reveal: 'none', drawCount: String(pos.length) } : { spreadKey: k, reveal: 'none' });
  },
  setDrawCount: v => set({ drawCount: v }),
  setCards: (c, reveal = 'none') => set({ cards: c, reveal }),
  addCard: card => {
    const { cards, spreadKey } = get();
    const pos = defsFor(spreadKey, 'vi');
    if (pos && cards.length >= pos.length) return false;
    set({ cards: [...cards, toSpreadCard({ ...card, orientation: 'xuoi' })], reveal: 'none' });
    return true;
  },
  removeCard: uid => set(s => ({ cards: s.cards.filter(x => x.uid !== uid), reveal: 'none' })),
  setOrientation: (uid, o) => set(s => ({ cards: s.cards.map(x => (x.uid === uid ? { ...x, orientation: o } : x)), reveal: 'none' })),
  clear: () => set({ cards: [], reveal: 'none', aiBg: 'off' }),
  setReveal: r => set({ reveal: r }),
  setAnswer: a => set({ answer: a }),
  setProvider: p => set({ provider: p }),
  setMessages: m => set({ messages: m }),
  setFollowups: f => set({ followups: f }),
  setCurrent: r => set({ current: r }),
  setAiBg: m => set({ aiBg: m }),
}));
