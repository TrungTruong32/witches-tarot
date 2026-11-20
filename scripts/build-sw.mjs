// Sau copy-static: sinh dist/sw.js từ src/sw/sw.ts (esbuild, đi kèm vite).
// Hai cache, tên theo nội dung — tự đổi khi cần, không còn quy tắc "nhớ bump CACHE" của sw.js cũ:
//   wtarot-app-<h1>: vỏ app + /assets/*. h1 = hash tên các asset (đã có hash nội dung) + index.html bỏ thẻ app-version
//                    (thẻ đó có giờ build → nếu tính vào thì bản build nào cũng đổi tên dù không đổi gì).
//   wtarot-data-<h2>: dữ liệu bài, icon, mặt lưng. h2 = hash (đường dẫn + nội dung) từng file → đổi code không bắt
//                    máy người dùng tải lại tarot.db; đổi tarot.db thì chỉ cache data đổi.
// Deploy chỉ đổi header (vercel.json: CSP, Permissions-Policy, Cache-Control) KHÔNG đổi sw.js hay tên cache — đúng ý:
// điều hướng là network-first nên khi online luôn nhận header mới. Chỉ bản trang lưu trong cache (lúc offline) còn
// mang header cũ cho tới lần build sau đổi index.html/asset. Nếu một thay đổi header bắt buộc phải tới máy offline
// ngay (vd. siết CSP vì sự cố), đổi kèm index.html để tên cache app đổi theo.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ROOT_STATIC } from './root-static.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');

// Không precache (bản ở gốc vẫn được chép vào dist):
//  - og-image.jpg: chỉ dùng khi chia sẻ link (lưu khi được tải, như bản cũ);
//  - manifest.webmanifest, cardback.png: index.html/CSS dùng bản có hash trong /assets → bản gốc chỉ là bản trùng.
// Giữ icon-*.png (manifest trỏ tới /icon-*.png) và apple-touch-icon.png (iOS tự dò ở gốc).
const NOT_PRECACHED = /^\/(og-image\.jpg|manifest\.webmanifest|cardback\.png)$/;

const APP_VERSION_META = /<meta\s+name="app-version"[^>]*>/g;

/** URL precache theo cache: app = '/', '/index.html', /assets/* (kể cả wasm); data = file dữ liệu ở gốc. */
export function precacheLists(dist) {
  const app = ['/', '/index.html'];
  const assets = join(dist, 'assets');
  if (existsSync(assets)) {
    for (const name of readdirSync(assets).sort()) if (statSync(join(assets, name)).isFile()) app.push('/assets/' + name);
  }
  const data = [];
  for (const name of readdirSync(dist).sort()) {
    const u = '/' + name;
    if (ROOT_STATIC.test(u) && !NOT_PRECACHED.test(u) && statSync(join(dist, name)).isFile()) data.push(u);
  }
  return { app, data };
}

const short = h => h.digest('hex').slice(0, 16);

/** Tên hai cache từ nội dung dist/. */
export function cacheNames(dist, { app, data }) {
  const ha = createHash('sha256');
  for (const u of [...app].sort()) if (u.startsWith('/assets/')) ha.update(u + '\0');
  ha.update(readFileSync(join(dist, 'index.html'), 'utf8').replace(APP_VERSION_META, ''));
  const hd = createHash('sha256');
  for (const u of [...data].sort()) {
    hd.update(u + '\0');
    hd.update(readFileSync(join(dist, u.slice(1))));
    hd.update('\0');
  }
  return { app: 'wtarot-app-' + short(ha), data: 'wtarot-data-' + short(hd) };
}

/** Biên dịch src/sw/sw.ts → dist/sw.js với hằng số đã nhúng. */
export async function buildSw(dist, entry = join(REPO, 'src', 'sw', 'sw.ts')) {
  const lists = precacheLists(dist);
  const names = cacheNames(dist, lists);
  await build({
    entryPoints: [entry],
    outfile: join(dist, 'sw.js'),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
    define: {
      __SW_APP_CACHE__: JSON.stringify(names.app),
      __SW_DATA_CACHE__: JSON.stringify(names.data),
      __SW_APP_ASSETS__: JSON.stringify(lists.app),
      __SW_DATA_ASSETS__: JSON.stringify(lists.data),
    },
  });
  return { ...names, lists };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = await buildSw(join(REPO, 'dist'));
    console.log(`build-sw: dist/sw.js, ${r.app} (${r.lists.app.length} file), ${r.data} (${r.lists.data.length} file)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
