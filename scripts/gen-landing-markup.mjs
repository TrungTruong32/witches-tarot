// Một lần: chép nguyên văn các khối tĩnh của trang mở đầu (SVG trang trí + khối SEO/FAQ) từ witches_tarot.html.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('tests/legacy/witches_tarot.legacy.html', 'utf8');
const between = (start, end, from = 0) => {
  const a = html.indexOf(start, from);
  if (a < 0) throw new Error('not found: ' + start);
  const b = html.indexOf(end, a + start.length);
  if (b < 0) throw new Error('end not found for: ' + start);
  return { a, b, text: html.slice(a, b + end.length) };
};
const landing = html.indexOf('<div id="landing">');

const stars = between('<svg class="lt-stars"', '</svg>', landing).text;
const orn = between('<svg class="lt-orn"', '</svg>', landing).text;
const arrow = between('<span class="lt-arrow">', '</span>', landing).text;
const seoOpen = '<section class="lt-seo" aria-labelledby="ltSeoTitle">';
const seo = between(seoOpen, '</section>', landing);
const seoInner = seo.text.slice(seoOpen.length, -'</section>'.length);

writeFileSync('src/features/landing/landingMarkup.ts', `// Khối tĩnh của trang mở đầu, chép NGUYÊN VĂN từ bản cũ (sinh bởi scripts/gen-landing-markup.mjs).
// Khối SEO phải khớp với FAQPage JSON-LD trong <head> của index.html.
export const LT_STARS = ${JSON.stringify(stars)};
export const LT_ORN = ${JSON.stringify(orn)};
export const LT_ARROW = ${JSON.stringify(arrow)};
export const LT_SEO_INNER = ${JSON.stringify(seoInner)};
`);
console.log('ok', stars.length, orn.length, arrow.length, seoInner.length);
