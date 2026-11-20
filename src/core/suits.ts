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
