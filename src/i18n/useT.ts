// Đa ngôn ngữ: t(key) cho chữ có trong từ điển, pick({vi, en}) cho chữ chỉ dùng một chỗ trong code.
import { useCallback, useMemo } from 'react';
import { useApp } from '../app/store';
import type { Lang } from '../core/types';
import { en } from './en';
import { vi, type I18nKey } from './vi';

/** Như t(key, fallback) của bản cũ: EN nếu có bản dịch, không thì tiếng Việt. */
export function translate(lang: Lang, k: I18nKey): string {
  return (lang === 'en' && en[k]) || vi[k];
}

export interface Translator {
  lang: Lang;
  t: (k: I18nKey) => string;
  pick: (p: { vi: string; en: string }) => string;
}

export function useT(): Translator {
  const lang = useApp(s => s.lang);
  const t = useCallback((k: I18nKey) => translate(lang, k), [lang]);
  const pick = useCallback((p: { vi: string; en: string }) => (lang === 'en' ? p.en : p.vi), [lang]);
  return useMemo(() => ({ lang, t, pick }), [lang, t, pick]);
}

/**
 * Bỏ ký hiệu/emoji đầu nhãn khi nút đã có icon SVG (setLabel của bản cũ): "☉︎ Home" → "Home".
 * Giữ nguyên nếu nhãn bắt đầu bằng chữ, số, ngoặc kép hoặc ngoặc đơn.
 */
export function stripGlyph(text: string): string {
  return String(text || '').replace(/^[^\p{L}\p{N}"“(]+/u, '');
}
