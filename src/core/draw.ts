// Bốc bài ngẫu nhiên (port từ witches_tarot.html L4556–4580).
import type { Card, SpreadCard } from './types';

let uidCounter = 0;
export function makeUid(): number {
  return ++uidCounter;
}

/** Xào Fisher-Yates rồi lấy n lá; chỉ chọn Ngược nếu lá có nghĩa ngược. Không sửa mảng đầu vào. */
export function drawRandomCards(cards: Card[], n: number, rng: () => number = Math.random): SpreadCard[] {
  const all = cards.slice();
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = all[i] as Card;
    all[i] = all[j] as Card;
    all[j] = t;
  }
  return all.slice(0, Math.min(n, all.length)).map(c => ({
    ...c,
    orientation: c.nghia_nguoc && String(c.nghia_nguoc).trim() && rng() < 0.5 ? 'nguoc' : 'xuoi',
  }));
}

/** Số lá muốn bốc: 1..12, không đọc được thì 3. */
export function readDrawCount(raw: string): number {
  return Math.max(1, Math.min(12, parseInt(raw, 10) || 3));
}

/** Tập con trường như legacy + uid mới. */
export function toSpreadCard(c: SpreadCard): SpreadCard {
  return {
    uid: makeUid(), id: c.id, deck: c.deck, ten: c.ten, bo: c.bo, so: c.so,
    y_nghia_xuoi: c.y_nghia_xuoi, nghia_nguoc: c.nghia_nguoc, tu_khoa: c.tu_khoa, image_url: c.image_url, orientation: c.orientation,
  };
}
