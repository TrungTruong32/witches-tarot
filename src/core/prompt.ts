// Dựng tin nhắn người dùng gửi AI: câu hỏi + từng lá (chiều, vị trí, ý nghĩa đúng bộ) + khối SPREAD FACTS do code tính.
// System prompt nằm ở shared/prompt.js (dùng chung với server).
import { cardText } from './cards';
import { computeSpreadFacts, factLines } from './facts';
import { posDesc, spreadByKey } from './spreads';
import type { CardEnMap, Lang, SpreadCard } from './types';

export { buildSystemPrompt } from '../../shared/prompt.js';

/** Nghĩa dài nhiều mục (Rider-Waite: Dẫn nhập/Tổng quan/Công việc/…) → chỉ gửi AI phần Dẫn nhập + Tổng quan. */
export function promptMeaning(input: string | null | undefined): string {
  const txt = String(input || '');
  if (txt.length <= 1200) return txt;
  const keep = txt.split('\n').filter(l => /^(Dẫn nhập|Tổng quan)\s*:/i.test(l.trim()));
  const out = keep.length ? keep.join('\n') : txt;
  return out.length > 1500 ? out.slice(0, 1500).replace(/\s+\S*$/, '') + '…' : out;
}

export interface UserPromptInput {
  question: string;
  cards: SpreadCard[];
  spreadKey: string;
  /** Tên vị trí theo ngôn ngữ hiện tại (defsFor), null nếu trải tự do. */
  positions: string[] | null;
  lang: Lang;
  cardEn: CardEnMap | null;
  /** Tên Ẩn Chính số n theo bộ của trải bài (cho dòng "lá tinh hoa"). */
  majorName: (n: number) => string | null;
}

/** Các bộ bài có mặt trong trải bài (theo thứ tự xuất hiện). */
export function readingDecks(cards: SpreadCard[]): string[] {
  return [...new Set(cards.map(c => c.deck).filter((d): d is string => !!d))];
}

export function buildUserPrompt(i: UserPromptInput): string {
  const { cards, spreadKey, positions, lang } = i;
  const q = i.question.trim();
  const decks = readingDecks(cards);
  const multi = decks.length > 1;
  const en = lang === 'en';
  const lines = cards
    .map((c, idx) => {
      const ct = cardText(c, lang, i.cardEn);
      const up = c.orientation === 'xuoi';
      const chieu = en ? (up ? 'Upright' : 'Reversed') : up ? 'Xuôi' : 'Ngược';
      const meaning = promptMeaning(up ? ct.y_nghia_xuoi : ct.nghia_nguoc);
      const kw = ct.tu_khoa ? `\n   ${en ? 'Keywords' : 'Từ khóa'}: ${ct.tu_khoa}` : '';
      const boTag = c.bo ? ` (${c.bo})` : '';
      const deckTag = multi && c.deck ? ` [${en ? 'deck' : 'bộ'}: ${c.deck}]` : '';
      const pd = posDesc(spreadKey, idx, lang);
      const pos = positions?.[idx];
      const posTag = pos ? ` [${en ? 'Position' : 'Vị trí'}: ${pos}${pd ? ' — ' + pd : ''}]` : '';
      return `${idx + 1}. ${c.ten}${boTag}${posTag}${deckTag} — ${chieu}\n   ${en ? 'Meaning' : 'Ý nghĩa'} (${chieu.toLowerCase()}): ${meaning}${kw}`;
    })
    .join('\n\n');
  const sdef = spreadByKey(spreadKey);
  const facts = cards.length >= 2 ? factLines(cards, computeSpreadFacts(cards), lang, i.majorName) : [];
  const factBlock = facts.map(l => '- ' + l).join('\n');

  if (en) {
    const dh = decks.length ? `Deck: ${decks.join(', ')}\n` : '';
    const st = positions && sdef ? `Spread: ${sdef.en}\n` : '';
    const sn = positions
      ? 'This spread has POSITIONS. Read each card according to its position role given in [Position: ...], then synthesize.\n\n'
      : '';
    const fb = facts.length
      ? `\n\n📊 SPREAD FACTS (computed by code, accurate — use as given, do not recount or contradict):\n${factBlock}`
      : '';
    return `${dh}${st}${sn}Querent's question: ${q || '(No specific question — give the general message this spread conveys.)'}\n\nCards drawn (${cards.length}):\n\n${lines}${fb}`;
  }
  const deckHeader = decks.length ? `Bộ bài: ${decks.join(', ')}\n` : '';
  const st = positions && sdef ? `Kiểu trải: ${sdef.vi}\n` : '';
  const spreadNote = positions
    ? 'Đây là kiểu trải bài có VỊ TRÍ. Hãy đọc mỗi lá theo đúng vai trò vị trí ghi trong ngoặc [Vị trí: ...], rồi mới tổng hợp.\n\n'
    : '';
  const fb = facts.length
    ? `\n\n📊 DỮ KIỆN TRẢI BÀI (do code tính, chính xác — dùng đúng như đã cho, không tự đếm lại, không được mâu thuẫn):\n${factBlock}`
    : '';
  return `${deckHeader}${st}${spreadNote}Câu hỏi của người hỏi: ${q || '(Không có câu hỏi cụ thể — hãy đưa ra thông điệp chung mà trải bài muốn nhắn nhủ.)'}\n\nCác lá bài đã rút (${cards.length} lá):\n\n${lines}${fb}`;
}
