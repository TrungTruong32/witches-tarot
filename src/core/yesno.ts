// Yes/No nhanh (port từ witches_tarot.html L2136–2245).
import type { ChatMessage } from '../services/ai/providers';
import { cardText } from './cards';
import { promptMeaning } from './prompt';
import type { Card, CardEnMap, Lang } from './types';

export type YnClass = 'yes' | 'no' | 'maybe';

/** Lá lưỡng lự → "CÓ THỂ"; còn lại xuôi = CÓ, ngược = KHÔNG (mọi bộ bài). */
export const YN_MAYBE = /(high priestess|n[ữu] t[ư]? t[ế]|the moon|m[ặa]t tr[ăa]ng|hanged|treo ng[ưu][ợo]c|wheel of fortune|b[áa]nh xe|seven of cups|7 of cups|two of|2 of|temperance|ti[ếe]t [đd][ộo])/i;

export function firstSentence(s: string): string {
  const t = String(s || '').trim();
  const i = t.search(/[.!?…]/);
  return i > 0 ? t.slice(0, i + 1) : t.slice(0, 140);
}

/** Phán quyết cục bộ (khi chưa có AI). */
export function localVerdict(c: Pick<Card, 'ten'>, rev: boolean, lang: Lang): { verdict: string; cls: YnClass } {
  const en = lang === 'en';
  if (YN_MAYBE.test(c.ten || '')) return { verdict: en ? 'MAYBE' : 'CÓ THỂ', cls: 'maybe' };
  return rev ? { verdict: en ? 'NO' : 'KHÔNG', cls: 'no' } : { verdict: en ? 'YES' : 'CÓ', cls: 'yes' };
}

export function ynClass(v: string): YnClass {
  const s = (v || '').toUpperCase();
  if (s.indexOf('THỂ') >= 0 || s.indexOf('THE') >= 0 || s.indexOf('MAYBE') >= 0) return 'maybe';
  if (s.indexOf('KHÔNG') >= 0 || s.indexOf('KHONG') >= 0 || s.indexOf('NO') >= 0) return 'no';
  return 'yes';
}

/** [system, user] gửi AI, đúng từng byte như bản cũ. */
export function yesNoMessages(q: string, c: Card, rev: boolean, lang: Lang, cardEn: CardEnMap | null): ChatMessage[] {
  const en = lang === 'en';
  const ct = cardText(c, lang, cardEn);
  const chieu = en ? (rev ? 'Reversed' : 'Upright') : (rev ? 'Ngược' : 'Xuôi');
  const meaning = rev ? (ct.nghia_nguoc || ct.tu_khoa || '') : (ct.y_nghia_xuoi || ct.tu_khoa || '');
  const sys = en ? [
    'You are an experienced, warm and honest Tarot reader.',
    'The user asked a yes/no question and drew ONE card (orientation fixed as below).',
    'Based on the QUESTION, the card and its ORIENTATION, give a verdict tailored to the question.',
    'Use only the meaning for the given orientation; do not invent meanings or add cards.',
    'Answer in English, in EXACTLY this format:',
    'The FIRST line is only one of: "VERDICT: YES" or "VERDICT: NO" or "VERDICT: MAYBE".',
    'Following lines: 2–4 concise sentences linking the card to the question, with one piece of advice.',
  ].join('\n') : [
    'Bạn là người đọc Tarot giàu kinh nghiệm, ấm áp và trung thực.',
    'Người dùng hỏi một câu trả lời được bằng Có/Không và đã rút MỘT lá bài (chiều xuôi/ngược cố định như dưới).',
    'Dựa trên CÂU HỎI, lá bài và CHIỀU đã cho, hãy đưa ra phán quyết bám sát câu hỏi.',
    'Chỉ dùng đúng ý nghĩa theo chiều đã cho, không bịa ý nghĩa khác, không thêm lá bài nào.',
    'Trả lời bằng tiếng Việt, ĐÚNG định dạng sau:',
    'Dòng ĐẦU TIÊN chỉ gồm một trong: "PHÁN QUYẾT: CÓ" hoặc "PHÁN QUYẾT: KHÔNG" hoặc "PHÁN QUYẾT: CÓ THỂ".',
    'Các dòng sau: 2–4 câu giải thích ngắn gọn, cụ thể, liên hệ trực tiếp lá bài với câu hỏi, kèm một lời khuyên.',
  ].join('\n');
  const usr = en
    ? 'Yes/No question: ' + (q || '(the querent did not write a specific question)') +
      '\nCard drawn: ' + c.ten + (c.bo ? ' (' + c.bo + ')' : '') + ' — ' + chieu +
      '\nMeaning (' + chieu.toLowerCase() + '): ' + promptMeaning(meaning) + (ct.tu_khoa ? '\nKeywords: ' + ct.tu_khoa : '')
    : 'Câu hỏi (Có/Không): ' + (q || '(người hỏi không ghi câu hỏi cụ thể)') +
      '\nLá đã rút: ' + c.ten + (c.bo ? ' (' + c.bo + ')' : '') + ' — ' + chieu +
      '\nÝ nghĩa (' + chieu.toLowerCase() + '): ' + promptMeaning(meaning) + (ct.tu_khoa ? '\nTừ khóa: ' + ct.tu_khoa : '');
  return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
}

/** Tách dòng phán quyết khỏi câu trả lời AI; không khớp → verdict rỗng (gọi localVerdict thay thế). */
export function parseVerdict(answer: string): { verdict: string; body: string } {
  let verdict = '', body = answer.trim();
  const m = answer.match(/(?:PH[ÁA]N\s*QUY[ẾE]T|VERDICT)\s*:\s*(C[ÓO]\s*TH[ỂE]|KH[ÔO]NG|C[ÓO]|YES|NO|MAYBE)/i);
  if (m) {
    verdict = (m[1] as string).replace(/\s+/g, ' ').toUpperCase();
    body = answer.replace(m[0], '').trim();
  }
  return { verdict, body };
}
