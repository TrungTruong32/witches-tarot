// Một lượt Yes/No (drawYesno của bản cũ L2178–2248) dạng hàm thuần: rút lá, phán quyết theo chiều lá, hỏi AI.
// Phụ thuộc bên ngoài (rng, gọi AI) tiêm qua `deps` như interpret.ts; màn YesNo gọi với mặc định.
import { cardText } from '../../core/cards';
import { renderMarkdown } from '../../core/markdown';
import type { Card, CardEnMap, Lang } from '../../core/types';
import { firstSentence, localVerdict, parseVerdict, ynClass, yesNoMessages, type YnClass } from '../../core/yesno';
import { chatComplete } from '../../services/ai/chat';
import { isAbortError, type ProviderCtx } from '../../services/ai/providers';

export interface YesNoDeps {
  /** Ngẫu nhiên [0, 1): lần 1 chọn lá, lần 2 chọn chiều. */
  rng?: () => number;
  chat?: typeof chatComplete;
}

export type Why = { kind: 'loading' } | { kind: 'text'; text: string } | { kind: 'html'; html: string };
export interface YesNoAnswer {
  verdict: string;
  cls: YnClass;
  why: Why;
}

/** Rút một lá trong bộ và chiều của nó (ngược khi rng < 0.5). Bộ rỗng → null. */
export function drawYesNoCard(rows: Card[], rng: () => number = Math.random): { card: Card; rev: boolean } | null {
  if (!rows.length) return null;
  const card = rows[Math.floor(rng() * rows.length)] as Card;
  return { card, rev: rng() < 0.5 };
}

/** Nghĩa theo chiều lá (thiếu thì từ khóa) — câu đầu của nó là lời giải khi không có AI. */
function meaningOf(card: Card, rev: boolean, lang: Lang, cardEn: CardEnMap | null): string {
  const ct = cardText(card, lang, cardEn);
  return rev ? ct.nghia_nguoc || ct.tu_khoa || '' : ct.y_nghia_xuoi || ct.tu_khoa || '';
}

/** Phán quyết theo chiều lá (không có AI). */
export function localAnswer(card: Card, rev: boolean, lang: Lang, cardEn: CardEnMap | null): YesNoAnswer {
  const local = localVerdict(card, rev, lang);
  return { verdict: local.verdict, cls: local.cls, why: { kind: 'text', text: firstSentence(meaningOf(card, rev, lang, cardEn)) } };
}

/**
 * Hỏi AI phán quyết cho lá đã rút. Lỗi → phán quyết theo chiều lá kèm câu lỗi; bị huỷ (lượt mới / rời màn) → null.
 * AI không ghi "PHÁN QUYẾT" → dùng phán quyết theo chiều lá; không có thân bài → câu đầu của nghĩa lá.
 */
export async function aiAnswer(
  question: string, card: Card, rev: boolean, cardEn: CardEnMap | null, ctx: ProviderCtx, deps: YesNoDeps = {},
): Promise<YesNoAnswer | null> {
  const { lang } = ctx;
  const local = localAnswer(card, rev, lang, cardEn);
  let raw = '';
  try {
    await (deps.chat ?? chatComplete)(yesNoMessages(question, card, rev, lang, cardEn), { onToken: tk => { raw += tk; } }, ctx);
  } catch (e) {
    if (isAbortError(e) || ctx.signal?.aborted) return null;
    const msg = e instanceof Error ? e.message : String(e);
    const en = lang === 'en';
    const text = (en ? '⚠️ AI error (' : '⚠️ AI lỗi (') + msg + (en ? '). Using orientation-based verdict: ' : '). Tạm dùng phán quyết theo chiều lá: ') + firstSentence(meaningOf(card, rev, lang, cardEn));
    return { ...local, why: { kind: 'text', text } };
  }
  const p = parseVerdict(raw);
  const verdict = p.verdict || local.verdict;
  return { verdict, cls: ynClass(verdict), why: p.body ? { kind: 'html', html: renderMarkdown(p.body) } : local.why };
}
