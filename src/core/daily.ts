// "Lá bài hôm nay": cố định theo ngày + bộ bài (cùng ngày mở lại vẫn ra cùng lá).
import type { Card } from './types';

/** Khoá ngày dạng Y-M-D KHÔNG đệm số 0 (định dạng cũ — dùng trong key localStorage `dailyNote:<ngày>`). */
export function dailyKey(d: Date = new Date()): string {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Lá của ngày cho một bộ (`cards` theo thứ tự id như truy vấn cũ). */
export function pickDailyCard(cards: Card[], deck: string, d: Date | string = new Date()): Card | null {
  if (!cards.length) return null;
  const day = typeof d === 'string' ? d : dailyKey(d);
  return cards[hashStr(day + '|' + deck) % cards.length] ?? null;
}
