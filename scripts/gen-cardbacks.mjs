// Một lần: chép nguyên văn bộ sinh mặt lưng lá bài từ witches_tarot.html sang src/core/cardBacks.js (chạy lại nếu bản cũ đổi — hiện bản cũ đã đóng băng).
import { readFileSync, writeFileSync } from 'node:fs';

const s = readFileSync('tests/legacy/witches_tarot.legacy.html', 'utf8');
const grab = (start, end) => {
  const a = s.indexOf(start);
  if (a < 0) throw new Error('not found: ' + start);
  const b = s.indexOf(end, a) + end.length;
  return s.slice(a, b);
};
const dedent = t => t.split('\n').map(l => l.replace(/^ {4}/, '')).join('\n');

const cb = dedent(grab('    const CB = (() => {', '\n    })();'));
const names = dedent(grab('    const CARD_BACK_NAMES = {', '\n    };'));
const alias = dedent(grab('    const CARD_BACK_ALIAS = ', ';'));

const out = `// Kiểu: cardBacks.d.ts (file này là JS nguyên văn từ bản cũ, không kiểm tra kiểu).
// Mặt lưng lá bài: các mẫu SVG vẽ bằng code (chép NGUYÊN VĂN từ bản cũ, test so khớp từng byte với witches_tarot.html).
// 'witches' là ảnh dựng sẵn; các kiểu khác là SVG sinh ra theo hạt giống cố định.

${cb}

${names}

${alias}

/** Các kiểu mặt lưng, theo thứ tự hiển thị. */
export const CARD_BACK_KEYS = CB.keys;
export const cardBackSvg = (/** @type {string} */ k) => CB.svg(k);
export const cardBackCss = (/** @type {string} */ k) => CB.css(k);
export { CARD_BACK_NAMES };

/** Giá trị đã lưu (localStorage 'cardBack') → kiểu hợp lệ: đổi tên cũ, không rõ thì 'zodiac'. */
export function normalizeCardBack(/** @type {string | null} */ saved) {
  const k = (saved && /** @type {Record<string, string>} */ (CARD_BACK_ALIAS)[saved]) || saved || 'zodiac';
  return CB.keys.includes(k) ? k : 'zodiac';
}
`;
writeFileSync('src/core/cardBacks.js', out);
writeFileSync('src/core/cardBacks.d.ts', `export const CARD_BACK_KEYS: readonly string[];
export function cardBackSvg(k: string): string;
export function cardBackCss(k: string): string;
export const CARD_BACK_NAMES: Record<string, [string, string]>;
export function normalizeCardBack(saved: string | null): string;
`);
console.log('ok', cb.length, names.length, alias.length);
