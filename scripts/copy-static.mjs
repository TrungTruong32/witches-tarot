// Sau `vite build`: chép dữ liệu bài + tệp SEO tĩnh từ gốc repo vào dist/.
// Chỉ chép theo danh sách trắng (ROOT_STATIC + la-bai/ + sitemap/robots/google*.html);
// .env, *.ipynb, Data/, local/ … không bao giờ được chép.
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_STATIC } from './root-static.mjs';

const SEO_FILES = /^(sitemap\.xml|robots\.txt|google[\w-]*\.html)$/;

export function copyStatic(root, dist) {
  if (!existsSync(join(root, 'tarot.db'))) {
    throw new Error('Thiếu tarot.db ở gốc repo — bản build sẽ không có dữ liệu bài, dừng lại.');
  }
  const copied = [];
  for (const name of readdirSync(root)) {
    if (ROOT_STATIC.test('/' + name) || SEO_FILES.test(name)) {
      cpSync(join(root, name), join(dist, name));
      copied.push(name);
    }
  }
  if (existsSync(join(root, 'la-bai'))) {
    cpSync(join(root, 'la-bai'), join(dist, 'la-bai'), { recursive: true });
    copied.push('la-bai/');
    if (writeLaBaiFonts(dist)) copied.push('la-bai/fonts.css');
  }
  return copied;
}

/** Trang tĩnh /la-bai/… (sinh bởi build_seo_pages.py) dùng font tự host như app: chép các @font-face từ CSS
 *  chính của bản build (url /assets/… đã băm) sang dist/la-bai/fonts.css. Không có CSS chính → bỏ qua (false). */
export function writeLaBaiFonts(dist) {
  const assets = join(dist, 'assets');
  if (!existsSync(assets)) return false;
  const faces = readdirSync(assets)
    .filter(n => /^index-[\w-]+\.css$/.test(n))
    .flatMap(n => readFileSync(join(assets, n), 'utf8').match(/@font-face\{[^}]*\}/g) ?? []);
  if (!faces.length) return false;
  writeFileSync(join(dist, 'la-bai', 'fonts.css'), faces.join('\n') + '\n');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  try {
    const copied = copyStatic(root, join(root, 'dist'));
    console.log(`copy-static: ${copied.length} mục → dist/ (${copied.join(', ')})`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
