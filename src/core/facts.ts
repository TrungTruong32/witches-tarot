// Luận giải 2 bước — BƯỚC 1: dữ kiện cấu trúc của trải bài tính bằng code (không nhờ AI đếm).
// Bước 2 (AI) nhận các dữ kiện này làm căn cứ, chỉ diễn giải chứ không tự đếm lại → bớt "bịa".
import { cardNumber, dignity, elementOfSuit, ELEMENTS, isMajorCard, NUMEROLOGY, NUMEROLOGY_EN, type Dignity } from './cards';
import type { Element, Lang, SpreadCard } from './types';

export interface SpreadFacts {
  n: number;
  /** Số lá nhận diện được (Ẩn Chính hoặc có chất). */
  known: number;
  majors: number;
  minors: number;
  reversed: number;
  /** Chỉ số các lá hoàng gia. */
  courts: number[];
  elements: Record<Element, number>;
  /** Số (Ẩn Phụ) → chỉ số các lá mang số đó. */
  numbers: Record<number, number[]>;
  /** Tương tác nguyên tố giữa các cặp lá kề nhau. */
  dignities: { a: number; b: number; kind: Dignity }[];
  sum: number | null;
  /** Lá tinh hoa: tổng số rút gọn về ≤ 21. */
  quint: number | null;
}

const COURT_RE = /^(page|knight|queen|king|princess|prince)$/i;

export function computeSpreadFacts(cards: SpreadCard[]): SpreadFacts {
  const n = cards.length;
  const f: SpreadFacts = {
    n, known: 0, majors: 0, minors: 0, reversed: 0, courts: [],
    elements: { fire: 0, water: 0, air: 0, earth: 0 }, numbers: {}, dignities: [], sum: null, quint: null,
  };
  if (!n) return f;
  let sum = 0;
  let sumCount = 0;
  cards.forEach((c, i) => {
    const major = isMajorCard(c);
    if (c.orientation === 'nguoc') f.reversed++;
    if (major) f.majors++;
    else f.minors++;
    const el = major ? null : elementOfSuit(c.bo);
    if (el) f.elements[el]++;
    if (el || major) f.known++;
    if (!major && COURT_RE.test(String(c.so || '').trim())) f.courts.push(i);
    const num = cardNumber(c);
    if (num != null) {
      sum += num;
      sumCount++;
      if (!major) (f.numbers[num] ??= []).push(i);
    }
    const prev = cards[i - 1];
    if (prev) {
      const d = dignity(isMajorCard(prev) ? null : elementOfSuit(prev.bo), el);
      if (d) f.dignities.push({ a: i - 1, b: i, kind: d });
    }
  });
  if (sumCount >= 2) {
    let q = sum;
    while (q > 21) q = String(q).split('').reduce((s, d) => s + +d, 0);
    f.sum = sum;
    f.quint = q;
  }
  return f;
}

const EL_HINT_EN: Record<Element, string> = {
  fire: 'passion · action · will',
  water: 'emotion · intuition · relationships',
  air: 'thought · communication · reason',
  earth: 'material · practical · stability',
};

/**
 * Dữ kiện thành danh sách dòng (dùng cho cả prompt AI lẫn giao diện).
 * `majorName(n)` trả tên Ẩn Chính số n theo bộ của trải bài (Witches: "The Shadow Side", Rider-Waite: "The Devil"…).
 */
export function factLines(cards: SpreadCard[], f: SpreadFacts, lang: Lang, majorName: (n: number) => string | null): string[] {
  if (!f.n) return [];
  const en = lang === 'en';
  const nm = (i: number) => i + 1 + '. ' + (cards[i]?.ten ?? '');
  const elName = (k: Element) => (en ? ELEMENTS[k].nameEn : ELEMENTS[k].name);
  const elHint = (k: Element) => (en ? EL_HINT_EN[k] : ELEMENTS[k].hint);
  const elKeys = Object.keys(f.elements) as Element[];
  const out: string[] = [];

  // Bộ bài ngoài chuẩn (không nhận ra Ẩn Chính/chất nào) → bỏ qua tỷ lệ Ẩn Chính để khỏi kết luận sai
  if (f.known === f.n) {
    const pct = Math.round((f.majors * 100) / f.n);
    let majNote = '';
    if (f.n >= 3 && pct >= 50)
      majNote = en
        ? ' → many Major Arcana: big life lessons / forces beyond personal control'
        : ' → nhiều Ẩn Chính: bài học lớn, yếu tố vượt ngoài tầm kiểm soát cá nhân';
    else if (f.n >= 3 && f.majors === 0)
      majNote = en
        ? ' → no Major Arcana: everyday matters, largely in your hands'
        : ' → không có Ẩn Chính: chuyện đời thường, phần lớn nằm trong tầm tay bạn';
    out.push((en ? `Major Arcana: ${f.majors}/${f.n} (${pct}%)` : `Ẩn Chính: ${f.majors}/${f.n} lá (${pct}%)`) + majNote);
  }

  let revNote = '';
  if (f.n >= 3 && f.reversed * 2 >= f.n)
    revNote = en
      ? ' → reversed-heavy: blocked, delayed or inward-turned energy'
      : ' → nhiều lá ngược: năng lượng bị chặn, trì hoãn hoặc hướng vào nội tâm';
  out.push((en ? `Reversed: ${f.reversed}/${f.n}` : `Lá ngược: ${f.reversed}/${f.n}`) + revNote);

  const elTotal = elKeys.reduce((a, k) => a + f.elements[k], 0);
  if (elTotal) {
    const parts = elKeys.filter(k => f.elements[k]).map(k => `${ELEMENTS[k].emoji} ${elName(k)} ${f.elements[k]}`);
    let line = (en ? 'Elements: ' : 'Nguyên tố: ') + parts.join(', ');
    const max = Math.max(...elKeys.map(k => f.elements[k]));
    const top = elKeys.filter(k => f.elements[k] === max);
    const top0 = top[0];
    if (max >= 2 && top.length === 1 && top0)
      line += en ? ` → ${elName(top0)} dominates (${elHint(top0)})` : ` → ${elName(top0)} chiếm ưu thế (${elHint(top0)})`;
    const missing = elKeys.filter(k => !f.elements[k]);
    if (f.minors >= 4 && missing.length)
      line += en ? `; missing: ${missing.map(elName).join(', ')}` : `; vắng: ${missing.map(elName).join(', ')}`;
    out.push(line);
  }

  if (f.courts.length >= 2)
    out.push(
      en
        ? `Court cards: ${f.courts.length} (${f.courts.map(nm).join('; ')}) → several people / personalities involved`
        : `Lá hoàng gia: ${f.courts.length} (${f.courts.map(nm).join('; ')}) → có nhiều người / tính cách liên quan`,
    );

  for (const k of Object.keys(f.numbers)) {
    const idx = f.numbers[Number(k)] ?? [];
    if (idx.length < 2) continue;
    const mean = (en ? NUMEROLOGY_EN : NUMEROLOGY)[k] || '';
    out.push(
      en
        ? `Repeated number ${k} ×${idx.length} (${idx.map(nm).join('; ')}) → theme: ${mean}`
        : `Số ${k} lặp ×${idx.length} (${idx.map(nm).join('; ')}) → chủ đề: ${mean}`,
    );
  }

  const dl: Record<Dignity, string> = {
    same: en ? 'same element, reinforce each other' : 'cùng nguyên tố, cộng hưởng mạnh',
    support: en ? 'friendly elements, support each other' : 'nguyên tố hỗ trợ nhau',
    oppose: en ? 'opposing elements, weaken / create tension' : 'nguyên tố đối nghịch, làm yếu nhau / tạo căng thẳng',
  };
  for (const d of f.dignities) out.push((en ? 'Adjacent pair ' : 'Cặp kề nhau ') + `${nm(d.a)} + ${nm(d.b)}: ${dl[d.kind]}`);

  const qn = f.quint != null ? majorName(f.quint) : null;
  if (qn)
    out.push(
      en
        ? `Quintessence (sum ${f.sum} → ${f.quint}): ${qn} — the underlying theme of the spread`
        : `Lá tinh hoa (tổng số ${f.sum} → ${f.quint}): ${qn} — chủ đề ngầm của cả trải bài`,
    );
  return out;
}

/** Dữ kiện trải bài đã thành câu (khung "Dữ kiện trải bài", prompt gửi AI, bản ghi nhật ký); dưới 2 lá thì không có. */
export function spreadFactLines(cards: SpreadCard[], lang: Lang, majorName: (n: number) => string | null): string[] {
  return cards.length >= 2 ? factLines(cards, computeSpreadFacts(cards), lang, majorName) : [];
}
