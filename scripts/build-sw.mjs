// Sau copy-static: sinh dist/sw.js từ src/sw/sw.ts (esbuild, đi kèm vite).
// Nhúng danh sách precache + phiên bản = hash (đường dẫn + nội dung) mọi file precache —
// đổi tarot.db, icon, mặt lưng bài hay bản build nào là tên cache đổi theo, SW cũ tự bị thay.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ROOT_STATIC } from './root-static.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');

// og-image chỉ dùng khi chia sẻ link → không precache (lưu khi được tải, như bản cũ).
const NOT_PRECACHED = /^\/og-image\.jpg$/;

/** Danh sách URL precache: vỏ app, /assets/* (kể cả wasm), dữ liệu bài, manifest, icon, mặt lưng bài. Không có la-bai/, SEO, sw.js. */
export function precacheList(dist) {
  const list = ['/', '/index.html'];
  const assets = join(dist, 'assets');
  if (existsSync(assets)) {
    for (const name of readdirSync(assets).sort()) if (statSync(join(assets, name)).isFile()) list.push('/assets/' + name);
  }
  for (const name of readdirSync(dist).sort()) {
    const u = '/' + name;
    if (ROOT_STATIC.test(u) && !NOT_PRECACHED.test(u) && statSync(join(dist, name)).isFile()) list.push(u);
  }
  return list;
}

/** Hash ngắn của (đường dẫn + nội dung) từng file — '/' trùng nội dung '/index.html' nên bỏ qua. */
export function swVersion(dist, list) {
  const h = createHash('sha256');
  for (const u of [...list].sort()) {
    if (u === '/') continue;
    h.update(u + '\0');
    h.update(readFileSync(join(dist, u.slice(1))));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

/** Biên dịch src/sw/sw.ts → dist/sw.js với hằng số đã nhúng. */
export async function buildSw(dist, entry = join(REPO, 'src', 'sw', 'sw.ts')) {
  const assets = precacheList(dist);
  const version = swVersion(dist, assets);
  await build({
    entryPoints: [entry],
    outfile: join(dist, 'sw.js'),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
    define: { __SW_VERSION__: JSON.stringify(version), __SW_ASSETS__: JSON.stringify(assets) },
  });
  return { version, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { version, assets } = await buildSw(join(REPO, 'dist'));
    console.log(`build-sw: dist/sw.js, cache wtarot-${version}, ${assets.length} file precache`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
