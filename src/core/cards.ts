// Tương ứng huyền học của lá bài (suy từ chất bài + số) — logic thuần, không đụng DOM.
import type { Card, CardEnMap, CardText, Element, Lang } from './types';

export const ELEMENTS: Record<Element, { emoji: string; name: string; nameEn: string; hint: string }> = {
  fire: { emoji: '🜂', name: 'Lửa', nameEn: 'Fire', hint: 'đam mê · hành động · ý chí' },
  water: { emoji: '🜄', name: 'Nước', nameEn: 'Water', hint: 'cảm xúc · trực giác · tình cảm' },
  air: { emoji: '🜁', name: 'Khí', nameEn: 'Air', hint: 'tư duy · giao tiếp · lý trí' },
  earth: { emoji: '🜃', name: 'Đất', nameEn: 'Earth', hint: 'vật chất · thực tế · ổn định' },
};

export const NUMEROLOGY_EN: Record<string, string> = {
  '0': 'Pure potential, open beginning',
  '1': 'Origin, seed, new will',
  '2': 'Balance, choice, partnership',
  '3': 'Creativity, growth, cooperation',
  '4': 'Stability, foundation, structure',
  '5': 'Challenge, upheaval, change',
  '6': 'Harmony, giving & receiving, healing',
  '7': 'Reflection, assessment, perseverance',
  '8': 'Power, movement, mastery',
  '9': 'Near fulfillment, depth, refinement',
  '10': 'Completion of a cycle, new start',
};

export const NUMEROLOGY: Record<string, string> = {
  '0': 'Tiềm năng thuần khiết, khởi đầu vô định',
  '1': 'Khởi nguồn, hạt giống, ý chí mới',
  '2': 'Cân bằng, lựa chọn, quan hệ đôi',
  '3': 'Sáng tạo, tăng trưởng, hợp tác',
  '4': 'Ổn định, nền tảng, cấu trúc',
  '5': 'Thử thách, biến động, thay đổi',
  '6': 'Hài hòa, cho–nhận, chữa lành',
  '7': 'Chiêm nghiệm, đánh giá, kiên trì',
  '8': 'Sức mạnh, chuyển động, làm chủ',
  '9': 'Gần viên mãn, chiều sâu, hoàn thiện',
  '10': 'Hoàn tất một chu kỳ, khởi đầu mới',
};

/** Tên Ẩn Chính mặc định (bộ Witches) theo số 0–21. */
export const MAJOR_NAMES: readonly string[] = [
  'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor', 'The High Priest', 'The Lovers',
  'The Chariot', 'Strength', 'The Hermit', 'The Wheel', 'Justice', 'The Hanged Man', 'Death', 'Temperance',
  'The Shadow Side', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Karma', 'The World',
];

export function elementOfSuit(bo: string | null | undefined): Element | null {
  const s = String(bo || '').toLowerCase();
  if (/wand|baton|gậy|lửa/.test(s)) return 'fire';
  if (/cup|chén|cốc|nước/.test(s)) return 'water';
  if (/sword|kiếm|gươm|khí/.test(s)) return 'air';
  if (/pentacle|coin|disk|đồng|tiền|đất/.test(s)) return 'earth';
  return null;
}

// Ký hiệu chiêm tinh cho trường chiem_tinh_hoc (cung hoàng đạo / hành tinh); so khớp tên đầy đủ
const ASTRO_GLYPHS: readonly [string, string][] = [
  ['bạch dương', '♈'], ['kim ngưu', '♉'], ['song tử', '♊'], ['cự giải', '♋'], ['sư tử', '♌'], ['xử nữ', '♍'],
  ['thiên bình', '♎'], ['bọ cạp', '♏'], ['nhân mã', '♐'], ['ma kết', '♑'], ['bảo bình', '♒'], ['song ngư', '♓'],
  ['mặt trời', '☉'], ['mặt trăng', '☾'], ['thủy tinh', '☿'], ['kim tinh', '♀'], ['hỏa tinh', '♂'], ['mộc tinh', '♃'],
  ['thổ tinh', '♄'], ['thiên vương tinh', '♅'], ['hải vương tinh', '♆'], ['diêm vương tinh', '♇'],
];

export function astroGlyph(txt: string | null | undefined): string {
  const t = String(txt || '').toLowerCase().normalize('NFC').replace(/^cung\s+/, '').replace(/\.$/, '').trim();
  const hit = ASTRO_GLYPHS.find(([k]) => t === k);
  return (hit ? hit[1] : '✦') + '︎';
}

export function isMajorCard(c: Pick<Card, 'bo'>): boolean {
  return /an ch[ií]nh|ẩn chính|major|trump/i.test(String(c.bo || ''));
}

export function romanToInt(input: string | null | undefined): number | null {
  const s = String(input || '').trim().toUpperCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (!/^[IVXL]+$/.test(s)) return null;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i] as string] as number;
    const b = v[s[i + 1] ?? ''] || 0;
    n += a < b ? -a : a;
  }
  return n;
}

/** Số của lá: Ẩn Chính 0–21; Ẩn Phụ Ace=1, 2–10; lá hoàng gia → null. */
export function cardNumber(c: Pick<Card, 'bo' | 'so'>): number | null {
  const so = String(c.so || '').trim();
  if (isMajorCard(c)) return romanToInt(so);
  if (/^(ace|át|a)$/i.test(so)) return 1;
  return /^\d+$/.test(so) ? parseInt(so, 10) : null;
}

export type Dignity = 'same' | 'support' | 'oppose';

/** Tương tác nguyên tố (Golden Dawn): cùng = cộng hưởng; Lửa–Khí, Nước–Đất = hỗ trợ; Lửa–Nước, Khí–Đất = đối nghịch. */
export function dignity(a: Element | null, b: Element | null): Dignity | null {
  if (!a || !b) return null;
  if (a === b) return 'same';
  const k = [a, b].sort().join('-');
  if (k === 'air-fire' || k === 'earth-water') return 'support';
  if (k === 'fire-water' || k === 'air-earth') return 'oppose';
  return null;
}

/**
 * Chữ của lá theo ngôn ngữ. Nghĩa luôn lấy theo đúng bộ của lá; card_en.json là bản dịch của riêng bộ Witches
 * nên chỉ áp cho Witches (hoặc lá không rõ bộ).
 */
export function cardText(c: Card, lang: Lang, cardEn: CardEnMap | null): CardText {
  const e = cardEn?.[c.id];
  if (lang === 'en' && e && (c.deck === 'Witches Tarot' || c.deck == null)) {
    return { ten: c.ten, tu_khoa: e.kw, y_nghia_xuoi: e.up, nghia_nguoc: e.rev };
  }
  return { ten: c.ten, tu_khoa: c.tu_khoa, y_nghia_xuoi: c.y_nghia_xuoi, nghia_nguoc: c.nghia_nguoc };
}
