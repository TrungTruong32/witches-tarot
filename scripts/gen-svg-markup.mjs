// Một lần: chép nguyên văn sprite icon (dòng 832) và 2 logo SVG (dòng 868, 915) từ witches_tarot.html.
import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('witches_tarot.html', 'utf8').split('\n');
const grab = (line, cls) => {
  const a = line.indexOf(`<svg viewBox="0 0 64 64" class="${cls}"`);
  if (a < 0) throw new Error('logo not found: ' + cls);
  return line.slice(a, line.indexOf('</svg>', a) + 6);
};
const sprite = lines[831].trim();
if (!sprite.startsWith('<svg width="0"')) throw new Error('sprite not on line 832');
const out = `// SVG tĩnh chép NGUYÊN VĂN từ bản cũ (sinh bởi scripts/gen-svg-markup.mjs). Là hằng số lúc build, không phải dữ liệu người dùng.
export const SPRITE = ${JSON.stringify(sprite)};
export const LOGO_L = ${JSON.stringify(grab(lines[867], 'logo-lg'))};
export const LOGO_H = ${JSON.stringify(grab(lines[914], 'logo'))};
`;
writeFileSync('src/components/svgMarkup.ts', out);
console.log('ok');
