// Dữ liệu trong link chia sẻ do người gửi tạo → KHÔNG tin. Port đúng loadSharedFromHash (witches_tarot.html L4072–4095).
// Hàm này chỉ làm sạch/giới hạn; escape HTML vẫn do tầng hiển thị (React render chữ thuần).
import { SPREADS, spreadByKey } from './spreads';
import type { ShareData } from './share';
import type { Card, SpreadCard } from './types';

export const SPREAD_SAFE_DECKS: ReadonlySet<string> = new Set(['Witches Tarot', 'Rider-Waite']);

export interface SharedReading {
  question: string;
  deck: string;
  text: string;
  spreadKey: string;
  cards: SpreadCard[];
}

const cut = (v: unknown, n: number): string => String(v == null ? '' : v).slice(0, n);
const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');

/** `byId` tra DB theo id (mọi bộ). Lá không có trong DB: chỉ giữ chữ ngắn, ảnh chỉ nhận từ tarot.vn, id = -1. */
export function sanitizeShared(d: ShareData, byId: (id: number) => Card | null): SharedReading | null {
  if (!d || !Array.isArray(d.c)) return null;
  // Cắt 15 lá TRƯỚC khi tra DB: link ác ý có hàng nghìn lá cũng chỉ tốn 15 lần tra
  const cards: SpreadCard[] = (d.c as unknown[]).slice(0, 15).map(raw => {
    let id: unknown, o: unknown, ten: unknown, img: unknown, bo: unknown, so: unknown, deck: unknown;
    if (Array.isArray(raw)) [id, o, ten, img, bo, so, deck] = raw;
    else {
      const sc = (raw ?? {}) as Record<string, unknown>; // link cũ dạng object
      id = sc.i; o = sc.o === 'nguoc' ? 1 : 0; ten = sc.t; img = sc.u; bo = sc.b; so = sc.s; deck = sc.k;
    }
    // id phải là số thật (chặt hơn bản cũ, vốn ép cả chuỗi số)
    const hit = typeof id === 'number' && id >= 0 ? byId(id) : null;
    const full = hit && (!deck || hit.deck === deck) ? hit : null; // id của bộ import cũ có thể trùng id bộ mới
    const safeImg = typeof img === 'string' && /^https:\/\/(www\.)?tarot\.vn\//.test(img) ? img : '';
    const base = full
      ? { ...full }
      : {
          id: -1, ten: cut(ten, 80), bo: cut(bo, 40), so: cut(so, 10), image_url: safeImg,
          deck: typeof deck === 'string' && SPREAD_SAFE_DECKS.has(deck) ? deck : '',
          y_nghia_xuoi: '', nghia_nguoc: '',
        };
    return { ...base, orientation: o ? 'nguoc' : 'xuoi' } as SpreadCard;
  });
  // kiểu trải: khoá (link mới) hoặc mảng nhãn tiếng Việt (link cũ)
  let stype = 'free';
  const p: unknown = d.p;
  if (typeof p === 'string') stype = p;
  else if (Array.isArray(p)) {
    for (const s of SPREADS) if (s.pos && s.pos.map(x => x[0]).join('|') === p.join('|')) stype = s.k;
  }
  return {
    question: clip(d.q, 500),
    deck: typeof d.d === 'string' && SPREAD_SAFE_DECKS.has(d.d) ? d.d : '',
    text: clip(d.a, 14000),
    cards,
    spreadKey: spreadByKey(stype) ? stype : 'free',
  };
}
