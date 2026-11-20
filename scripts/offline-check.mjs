// Kiểm tra PWA (SW sinh lúc build) trên Chrome thật (Playwright) với bản build trong dist/ (chạy `npm run build` trước).
// 1) Giả lập máy đã cài bản cũ: tạo sẵn cache 'wtarot-v9'.  2) Mở '/', chờ SW mới điều khiển trang; wtarot-v9 bị xoá,
//    còn đúng wtarot-app-* + wtarot-data-*.
// 3) "Bản build sau" chỉ đổi thẻ app-version → sw.js y hệt (trình duyệt không cập nhật gì, không tải lại tarot.db).
// 4) "Bản build sau" đổi code (thêm một asset) → SW mới cài: tên cache app đổi, cache data giữ nguyên,
//    KHÔNG tải lại tarot.db, asset cũ chép từ cache cũ (không đi mạng).
// 5) Tắt hẳn máy chủ + setOffline → chỉ cache trả lời được. Mở /tra-cuu, /boc-bai, /nhat-ky: app phải hiện,
//    danh sách lá nạp từ tarot.db đã cache.
// Chạy: node scripts/offline-check.mjs   → in PASS/FAIL từng bước, thoát mã 1 nếu có bước lỗi.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { buildSw } from './build-sw.mjs';
// máy chủ tĩnh áp đúng rewrite + header của vercel.json (route app → index.html, /assets immutable, /sw.js no-cache)
import { serveDist } from './serve-dist.mjs';

const DIST = resolve(fileURLToPath(import.meta.url), '..', '..', 'dist');

/** Bản sao dist/ (bỏ la-bai cho nhẹ) với index.html đổi thẻ app-version, tuỳ chọn thêm một asset; sinh lại sw.js. */
async function variant(tmp, name, { meta, extraAsset }) {
  const dir = join(tmp, name);
  cpSync(DIST, dir, { recursive: true, filter: src => !src.startsWith(join(DIST, 'la-bai')) });
  const idx = join(dir, 'index.html');
  writeFileSync(idx, readFileSync(idx, 'utf8').replace(/(<meta\s+name="app-version"\s+content=")[^"]*/, '$1' + meta));
  if (extraAsset) writeFileSync(join(dir, 'assets', extraAsset), '// offline-check\n');
  return { dir, ...(await buildSw(dir)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(DIST, 'sw.js'))) {
    console.error('Thiếu dist/sw.js — chạy `npm run build` trước.');
    process.exit(1);
  }
  const tmp = mkdtempSync(join(tmpdir(), 'offline-check-'));
  const { server, site } = await serveDist(DIST);
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
  const cacheKeys = () => page.evaluate(() => caches.keys());
  let first = { app: '', data: '' };

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

    await step('activate đã xoá wtarot-v9, còn đúng wtarot-app-* + wtarot-data-* (có tarot.db)', async () => {
      const keys = (await cacheKeys()).sort();
      const app = keys.find(k => /^wtarot-app-[0-9a-f]{16}$/.test(k));
      const data = keys.find(k => /^wtarot-data-[0-9a-f]{16}$/.test(k));
      if (keys.length !== 2 || !app || !data) throw new Error('caches: ' + JSON.stringify(keys));
      const hasDb = await page.evaluate(async k => !!(await (await caches.open(k)).match('/tarot.db')), data);
      if (!hasDb) throw new Error('cache data thiếu tarot.db');
      first = { app, data };
    });

    await step('Build sau chỉ đổi thẻ app-version → sw.js y hệt (không cập nhật, không tải lại tarot.db)', async () => {
      const a = await variant(tmp, 'meta-only', { meta: 'offline-check meta-only' });
      if (a.app !== first.app || a.data !== first.data) throw new Error(`tên cache đổi: ${a.app} ${a.data}`);
      if (!readFileSync(join(a.dir, 'sw.js')).equals(readFileSync(join(DIST, 'sw.js')))) throw new Error('sw.js khác bản trước');
    });

    await step('Build sau đổi code → SW mới: cache app mới, cache data giữ nguyên, không tải lại tarot.db/asset cũ', async () => {
      const b = await variant(tmp, 'code-change', { meta: 'offline-check code-change', extraAsset: 'offline-check-x.js' });
      if (b.app === first.app || b.data !== first.data) throw new Error(`tên cache: ${b.app} ${b.data}`);
      site.root = b.dir;
      site.hits = [];
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
      // chờ SW mới activate xong: cache app cũ bị xoá, cache app mới có mặt
      let keys = [];
      for (let t = Date.now(); Date.now() - t < 20000; await new Promise(r => setTimeout(r, 200))) {
        keys = (await cacheKeys()).sort();
        if (keys.includes(b.app) && !keys.includes(first.app)) break;
      }
      if (JSON.stringify(keys) !== JSON.stringify([b.app, b.data].sort())) throw new Error('caches: ' + JSON.stringify(keys));
      const refetched = site.hits.filter(p => p === '/tarot.db' || (p.startsWith('/assets/') && p !== '/assets/offline-check-x.js'));
      if (refetched.length) throw new Error('tải lại: ' + refetched.join(', '));
      console.log('      yêu cầu mạng khi cập nhật: ' + site.hits.join(', '));
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

    await step('Không có lỗi JS trên trang', async () => {
      if (errors.length) throw new Error(errors.join(' | '));
    });
  } finally {
    await browser.close();
    if (server.listening) server.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả PASS');
  process.exit(failed ? 1 : 0);
}
