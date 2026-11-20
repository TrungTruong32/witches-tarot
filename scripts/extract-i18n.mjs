// Một lần: dựng từ điển src/i18n/vi.ts + en.ts từ bản cũ.
// VI: chữ trong HTML của các phần tử có data-i18n / data-i18n-ph và các id trong T_IDS / T_PH (bản cũ chụp lại lúc chạy).
// EN: object I18N.en trong script cũ. Bỏ các key EN không còn dùng (inventory §5.3).
// Chạy: npx vite-node scripts/extract-i18n.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadLegacy } from '../tests/legacy/harness.ts';

const html = readFileSync('witches_tarot.html', 'utf8');
const doc = new JSDOM(html).window.document;
const { I18N, T_IDS, T_PH } = loadLegacy(['I18N', 'T_IDS', 'T_PH']);

const DEAD = new Set(['draw.count', 'reading.aiHead', 'reading.spread.free', 'reading.spread.ppf', 'reading.spread.sac',
  'reading.spread.celtic', 'reading.spreadDraw', 'reading.spreadLabel']);

const vi = {};
const conflicts = [];
const put = (k, v, where) => {
  if (v == null) return;
  if (k in vi && vi[k] !== v) conflicts.push(`${k}: "${vi[k]}" vs "${v}" (${where})`);
  if (!(k in vi)) vi[k] = v;
};
doc.querySelectorAll('[data-i18n]').forEach(el => put(el.getAttribute('data-i18n'), el.textContent, 'data-i18n'));
doc.querySelectorAll('[data-i18n-ph]').forEach(el => put(el.getAttribute('data-i18n-ph'), el.getAttribute('placeholder') || '', 'data-i18n-ph'));
for (const [id, k] of Object.entries(T_IDS)) { const el = doc.getElementById(id); if (el) put(k, el.textContent, '#' + id); else console.warn('missing #' + id); }
for (const [id, k] of Object.entries(T_PH)) { const el = doc.getElementById(id); if (el) put(k, el.getAttribute('placeholder') || '', '#' + id + '[ph]'); else console.warn('missing #' + id); }

// Key chỉ dùng trong JS: t('key', 'chữ VI dự phòng') — lấy chữ VI dự phòng ngay trong lời gọi
for (const m of html.matchAll(/\bt\('([\w.]+)',\s*'([^']*)'\)/g)) put(m[1], m[2], "t('" + m[1] + "')");

const en = {};
for (const [k, v] of Object.entries(I18N.en)) if (!DEAD.has(k)) en[k] = v;
const enOnly = Object.keys(en).filter(k => !(k in vi));

const lit = o => '{\n' + Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n') + '\n}';
writeFileSync('src/i18n/vi.ts', `// Chữ tiếng Việt của giao diện — lấy NGUYÊN VĂN từ HTML bản cũ (sinh bởi scripts/extract-i18n.mjs).\nexport const vi = ${lit(vi)} as const;\n\nexport type I18nKey = keyof typeof vi;\n`);
writeFileSync('src/i18n/en.ts', `// Bản dịch tiếng Anh — từ I18N.en của bản cũ (sinh bởi scripts/extract-i18n.mjs). Key thiếu → dùng tiếng Việt.\nimport type { I18nKey } from './vi';\n\nexport const en: Partial<Record<I18nKey, string>> = ${lit(en)};\n`);
console.log('vi keys', Object.keys(vi).length, '| en keys', Object.keys(en).length, '| en-only', enOnly, '| conflicts', conflicts);
