// Kiểm tra PWA offline trên Chrome thật (Playwright) với bản build trong dist/ (chạy `npm run build` trước).
// 1) Giả lập máy đã cài bản cũ: tạo sẵn cache 'wtarot-v9'.  2) Mở '/', chờ SW mới điều khiển trang.
// 3) Tắt hẳn máy chủ + setOffline → chỉ cache trả lời được.  4) Mở /tra-cuu, /boc-bai, /nhat-ky: app phải hiện,
//    danh sách lá nạp từ tarot.db đã cache. Đồng thời: cache cũ wtarot-v9 đã bị xoá.
// Chạy: node scripts/offline-check.mjs   → in PASS/FAIL từng bước, thoát mã 1 nếu có bước lỗi.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const DIST = resolve(fileURLToPath(import.meta.url), '..', '..', 'dist');
const APP_ROUTES = new Set(['/', '/hom-nay', '/tra-cuu', '/boc-bai', '/trai-bai', '/nhat-ky', '/yes-no', '/bau-troi']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.txt': 'text/plain',
};

/** Máy chủ tĩnh tí hon cho dist/: route của app → index.html (như rewrite SPA của Vercel), thư mục → index.html. */
export function serveDist(dist, port = 0) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (APP_ROUTES.has(p.replace(/\/+$/, '') || '/')) p = '/index.html';
    let f = resolve(dist, '.' + p);
    if (f !== dist && !f.startsWith(dist + sep)) { res.statusCode = 403; return res.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(f));
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(DIST, 'sw.js'))) {
    console.error('Thiếu dist/sw.js — chạy `npm run build` trước.');
    process.exit(1);
  }
  const server = await serveDist(DIST);
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('tarotRitual', '0'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log('PASS  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
  };
  const waitDb = () => page.waitForFunction(() => {
    const st = document.getElementById('bootStatus');
    return !!st && getComputedStyle(st).display === 'none';
  }, null, { timeout: 20000 });

  try {
    await step('Giả lập bản cũ: tạo cache wtarot-v9 trước khi có SW mới', async () => {
      await page.goto(BASE + '/robots.txt');
      await page.evaluate(async () => { await (await caches.open('wtarot-v9')).put('/', new Response('legacy shell')); });
    });

    await step('Online: mở "/", SW mới cài xong và điều khiển trang', async () => {
      await page.goto(BASE + '/');
      // trang mở đầu '/' không có #bootStatus → chỉ chờ SW điều khiển trang (clients.claim sau khi precache xong)
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    });

    await step('activate đã xoá wtarot-v9, chỉ còn đúng một cache wtarot-<hash>', async () => {
      const keys = await page.evaluate(() => caches.keys());
      if (keys.includes('wtarot-v9') || keys.length !== 1 || !/^wtarot-[0-9a-f]{16}$/.test(keys[0])) throw new Error('caches: ' + JSON.stringify(keys));
      const n = await page.evaluate(async k => (await (await caches.open(k)).keys()).length, keys[0]);
      if (n < 15) throw new Error('precache chỉ có ' + n + ' mục');
    });

    // Tắt hẳn máy chủ (không chỉ setOffline): chỉ còn cache của SW trả lời được.
    server.closeAllConnections();
    await new Promise(ok => server.close(ok));
    await ctx.setOffline(true);

    await step('Offline: /tra-cuu hiện app, danh sách lá nạp từ tarot.db đã cache', async () => {
      const res = await page.goto(BASE + '/tra-cuu');
      if (!res || !res.fromServiceWorker()) throw new Error('trang không đến từ SW');
      await waitDb();
      await page.waitForSelector('#cardsList .card-item', { timeout: 20000 });
      const n = await page.locator('#cardsList .card-item').count();
      if (n < 22) throw new Error('chỉ có ' + n + ' lá');
      console.log('      ' + n + ' lá trong danh sách');
    });

    await step('Offline: /boc-bai hiện app, chọn được kiểu trải và xòe bài', async () => {
      await page.goto(BASE + '/boc-bai');
      await waitDb();
      await page.click('#drawSpreadPicker .sp-tile[data-k="ppf"]');
      await page.click('#pickBtn');
      await page.waitForSelector('#drawFan .wcard', { timeout: 15000 });
    });

    await step('Offline: /nhat-ky (deep link) vẫn trả vỏ app', async () => {
      await page.goto(BASE + '/nhat-ky');
      await page.waitForSelector('#historyView', { state: 'attached', timeout: 15000 });
    });

    await step('Offline: không có lỗi JS trên trang', async () => {
      if (errors.length) throw new Error(errors.join(' | '));
    });
  } finally {
    await browser.close();
    if (server.listening) server.close();
  }
  console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả PASS');
  process.exit(failed ? 1 : 0);
}
