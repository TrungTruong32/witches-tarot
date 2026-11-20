// Một lần: tách CSS trong witches_tarot.html (giữa <style> và </style>) thành các file theo phần ở src/styles/,
// giữ NGUYÊN từng byte. Test src/styles/styles.test.ts ghép lại và so với bản cũ.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('witches_tarot.html', 'utf8');
const a = html.indexOf('<style>') + '<style>'.length;
const b = html.indexOf('</style>', a);
const css = html.slice(a, b);
const startLine = html.slice(0, a).split('\n').length; // dòng chứa <style>

// [dòng bắt đầu (số dòng trong file cũ), tên file] — mỗi phần chạy tới trước phần kế tiếp
const PARTS = [
  [startLine, 'tokens.css'], [83, 'base.css'], [133, 'nav-drawer.css'], [146, 'landing.css'], [241, 'transitions.css'],
  [248, 'browse.css'], [288, 'tabs-status.css'], [294, 'reading.css'], [344, 'spread-picker.css'], [365, 'board.css'],
  [381, 'reading-controls.css'], [397, 'forms.css'], [410, 'spread-items.css'], [431, 'lightbox.css'], [435, 'ai-output.css'],
  [452, 'background.css'], [458, 'cardback.css'], [468, 'moon.css'], [478, 'ritual.css'], [502, 'chips.css'],
  [512, 'modals.css'], [527, 'deckbar.css'], [535, 'history.css'], [550, 'ai-cards-bg.css'], [571, 'notes-misc.css'],
  [581, 'draw.css'], [590, 'corr-chips.css'], [600, 'sky.css'], [613, 'yesno.css'], [632, 'site.css'], [638, 'flip.css'],
  [668, 'riffle.css'], [686, 'icons.css'], [693, 'nav-desktop.css'], [760, 'wheel.css'], [812, 'responsive.css'],
];

// Cắt theo dòng, giữ ký tự xuống dòng; dòng đầu tiên của css là phần còn lại của dòng <style> (chỉ "\n")
const lines = css.split(/(?<=\n)/);
const out = PARTS.map(() => '');
lines.forEach((line, i) => {
  const ln = startLine + i;
  let idx = 0;
  for (let p = 0; p < PARTS.length; p++) if (ln >= PARTS[p][0]) idx = p;
  out[idx] += line;
});
if (out.join('') !== css) throw new Error('split mismatch');

PARTS.forEach(([, name], i) => writeFileSync(`src/styles/${name}`, out[i]));
const names = PARTS.map(([, n]) => n);
writeFileSync('src/styles/order.ts', `// Thứ tự ghép các file CSS (đúng thứ tự trong bản cũ). Sinh bởi scripts/split-legacy-css.mjs.
export const CSS_ORDER = ${JSON.stringify(names, null, 2).replace(/"/g, "'")} as const;
`);
writeFileSync('src/styles/index.ts', `// CSS của app: nguyên văn bản cũ, chia theo phần, nạp đúng thứ tự (xem order.ts).
${names.map(n => `import './${n}';`).join('\n')}
`);
console.log('wrote', names.length, 'files,', css.length, 'bytes');
