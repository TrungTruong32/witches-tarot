// Ghi "golden" system prompt từ code CŨ (client trong witches_tarot.html + server trong api/ai.js)
// để test chứng minh module dùng chung shared/prompt.js cho ra đúng từng byte. Đã chạy MỘT lần trên commit 4498952 (trước khi api/ai.js bỏ systemPrompt riêng); giờ chỉ còn để tham khảo cách tạo golden.
import { copyFileSync, appendFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadLegacyWithContext } from '../tests/legacy/harness.ts';

const OUT = 'shared/__golden__';
mkdirSync(OUT, { recursive: true });
const DECK = 'Witches Tarot';

const { fns, ctx } = loadLegacyWithContext(['buildSystemPrompt'], { lang: 'vi' });
for (const lang of ['vi', 'en']) {
  ctx.lang = lang;
  writeFileSync(`${OUT}/system-${lang}-client.txt`, fns.buildSystemPrompt(DECK));
}

const tmp = 'api/.__dump_prompt.mjs';
copyFileSync('api/ai.js', tmp);
appendFileSync(tmp, '\nexport { systemPrompt as __systemPrompt };\n');
try {
  const mod = await import(pathToFileURL(tmp).href);
  for (const lang of ['vi', 'en']) writeFileSync(`${OUT}/system-${lang}-server.txt`, mod.__systemPrompt(lang, DECK));
} finally {
  rmSync(tmp);
}
console.log('golden prompts written to', OUT);
