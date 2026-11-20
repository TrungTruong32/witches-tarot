// Nhãn các chất bài (ô chọn ở trang Tra cứu) và đường dẫn trang SEO của từng lá.
import type { Card } from './types';

export interface SuitMeta {
  vi: string;
  en: string;
  sym: string;
  /** nguyên tố [VI, EN] */
  el?: [string, string];
}

export const SUIT_META: Record<string, SuitMeta> = {
  all: { vi: 'Tất cả', en: 'All', sym: '✧' },
  'Bo An Chinh': { vi: 'Ẩn Chính', en: 'Major', sym: '✦' },
  'Bo Wands': { vi: 'Gậy', en: 'Wands', sym: '🜂', el: ['Lửa', 'Fire'] },
  'Bo Cups': { vi: 'Cốc', en: 'Cups', sym: '🜄', el: ['Nước', 'Water'] },
  'Bo Swords': { vi: 'Kiếm', en: 'Swords', sym: '🜁', el: ['Khí', 'Air'] },
  'Bo Pentacles': { vi: 'Tiền', en: 'Pentacles', sym: '🜃', el: ['Đất', 'Earth'] },
};

/** Bộ có trang SEO tĩnh (thư mục la-bai/<slug>/). */
export const SEO_DECK_SLUG: Record<string, string> = { 'Witches Tarot': 'witches-tarot', 'Rider-Waite': 'rider-waite' };

/** `/la-bai/<bộ>/<tên-lá>/`, hoặc '' nếu bộ không có trang SEO. */
export function seoCardPath(card: Pick<Card, 'deck' | 'ten'>): string {
  const d = card.deck ? SEO_DECK_SLUG[card.deck] : undefined;
  const slug = String(card.ten || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return d && slug ? `/la-bai/${d}/${slug}/` : '';
}

/** Nhãn dự phòng cho chất bài không có trong SUIT_META. */
export const BO_LABELS: Record<string, string> = {
  'Bo An Chinh': 'Ẩn Chính',
  'Bo Wands': 'Wands - Lửa',
  'Bo Cups': 'Cups - Nước',
  'Bo Swords': 'Swords - Khí',
  'Bo Pentacles': 'Pentacles - Đất',
};

// ---- Dựng trước khi tarot.db nạp xong ----
// Danh sách bộ và chất bài của tarot.db là cố định (mỗi bộ 78 lá: 22 Ẩn Chính + 4 chất × 14), nên trang Tra cứu
// vẽ được ô chất bài / ô chọn bộ ngay, không chờ DB. DB về thì số thật từ DB thay vào (bình thường trùng khớp).
/** Các bộ theo đúng thứ tự db.decks() (Witches Tarot trước). */
export const STATIC_DECKS: readonly string[] = ['Witches Tarot', 'Rider-Waite'];
/** Chất bài theo thứ tự db.suits() (ORDER BY MIN(id)) và số lá mỗi chất. */
export const STATIC_SUITS: readonly (readonly [bo: string, count: number])[] = [
  ['Bo An Chinh', 22], ['Bo Wands', 14], ['Bo Cups', 14], ['Bo Swords', 14], ['Bo Pentacles', 14],
];

/** Bộ bài boot() sẽ chọn: bộ đã lưu nếu có trong danh sách, không thì bộ đầu (cùng luật với boot). */
export function guessDeck(saved: string): string {
  return STATIC_DECKS.includes(saved) ? saved : STATIC_DECKS[0]!;
}
