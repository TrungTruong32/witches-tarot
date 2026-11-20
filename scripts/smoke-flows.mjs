// Kiểm tra nhanh các luồng chính trên trình duyệt thật (Chrome qua Playwright) với dữ liệu bài thật ở gốc repo.
// AI miễn phí (/api/ai) được giả lập bằng page.route nên không tốn lượt, không cần mạng.
// Mọi vi phạm CSP (securitypolicyviolation) trên mọi trang/mọi lần điều hướng đều được gom về Node và làm hỏng bước cuối.
// Chạy: node scripts/smoke-flows.mjs        → dev server Vite (cổng 5312), in từng bước PASS/FAIL, thoát mã 1 nếu có bước lỗi.
//       node scripts/smoke-flows.mjs <BASE> → chạy với máy chủ có sẵn (vd. dist/ qua serve-dist, hoặc bản preview), không bật Vite.
//       (hoặc biến môi trường BASE=...)
import { chromium } from '@playwright/test';

const ARG_BASE = (process.argv[2] || process.env.BASE || '').replace(/\/+$/, '');
let vite = null;
if (!ARG_BASE) {
  const { createServer: createVite } = await import('vite');
  vite = await createVite({ server: { port: 5312, strictPort: true }, logLevel: 'error' });
  await vite.listen();
}
const BASE = ARG_BASE || 'http://localhost:5312';
const browser = await chromium.launch({ channel: 'chrome' });
const cspViolations = [];
/** Lắng nghe vi phạm CSP từ trước khi trang chạy script; binding sống qua mọi lần điều hướng của context. */
async function watchCsp(c) {
  await c.exposeBinding('__cspViolation', (_src, v) => { cspViolations.push(v); });
  await c.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      // @ts-ignore — binding do Playwright gắn
      window.__cspViolation({ page: location.pathname, directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, sample: e.sample });
    });
  });
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
await watchCsp(ctx);
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await ctx.addInitScript(() => {
  if (!sessionStorage.getItem('smokeInit')) {
    localStorage.setItem('tarotRitual', '0');
    localStorage.setItem('tarotCloudSave', '0');
    sessionStorage.setItem('smokeInit', '1');
  }
});
let aiReply = 'Xin **chào** — lời giải thử.';
await ctx.route('**/api/ai', route =>
  route.fulfill({ status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-ai-provider': 'm', 'x-ai-remaining': '4' }, body: aiReply }));
await ctx.route('**/api/readings', route => route.fulfill({ status: 200, body: '{}' }));
// proxy ảnh tarot.vn (dùng khi vẽ ảnh chia sẻ) → ảnh PNG 1×1 cùng nguồn, không đi mạng
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
await ctx.route('**/api/img?*', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
// Speed Insights / Web Analytics của Vercel (/_vercel/*): dev server và máy chủ thử không có → script rỗng
const stubVercel = c => c.route(/\/_vercel\//, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await stubVercel(ctx);

const errors = [];
const watchErrors = (p, tag) => {
  p.on('pageerror', e => errors.push(`pageerror${tag}: ` + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(`console${tag}: ` + m.text() + ' @ ' + (m.location().url || '')); });
};
const page = await ctx.newPage();
watchErrors(page, '');

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
}
const expectEq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
// DB sẵn sàng = #bootStatus (AppLayout) đã có và đã ẩn. Không dựa vào nút bị khoá: #yesnoBtn không bao giờ disabled.
// Hết giờ thì ném lỗi (bước hỏng rõ ràng), khác parity-screens vốn bỏ qua.
const waitDb = p => p.waitForFunction(() => {
  const st = document.getElementById('bootStatus');
  return !!st && getComputedStyle(st).display === 'none';
}, null, { timeout: 30000 });

try {
  await step('Bốc bài: chọn trải 3 lá, tự tay chọn, lá vào bàn + ý nghĩa có tên vị trí', async () => {
    await page.goto(BASE + '/boc-bai');
    await waitDb(page);
    await page.click('#drawSpreadPicker .sp-tile[data-k="ppf"]');
    await page.click('#pickBtn');
    await page.waitForSelector('#drawFan .wcard');
    // nửa dưới lá bị khung bánh xe che (overflow) → bấm qua DOM như người dùng chạm vào phần lá lộ ra
    for (const i of [3, 20, 40]) await page.evaluate(k => document.querySelectorAll('#drawFan .wcard')[k].click(), i);
    await page.waitForSelector('#drawToReading:not([disabled])', { timeout: 15000 });
    expectEq(await page.locator('#drawBoard .board-card').count(), 3, 'board cards');
    const names = await page.locator('#drawResults .draw-name').allTextContents();
    expectEq(names.length, 3, 'result count');
    if (!names[0].startsWith('1. Quá khứ')) throw new Error('first result label: ' + names[0]);
  });

  await step('Đưa sang Trải bài AI: mang theo kiểu trải + 3 lá', async () => {
    await page.click('#drawToReading');
    await page.waitForURL('**/trai-bai');
    expectEq(await page.locator('#spreadList .spread-item').count(), 3, 'spread rows');
    expectEq(await page.locator('.sp-tile[aria-checked="true"]').getAttribute('data-k'), 'ppf', 'spread type');
  });

  await step('Diễn giải: stream lời giải, hiện lượt còn lại, lưu nhật ký', async () => {
    await page.fill('#questionInput', 'Công việc sắp tới?');
    await page.click('#interpretBtn');
    await page.waitForFunction(() => document.querySelector('#aiOutput strong')?.textContent === 'chào', null, { timeout: 15000 });
    expectEq((await page.textContent('#aiQuota'))?.trim(), 'Còn 4 lượt miễn phí hôm nay', 'quota');
    await page.waitForSelector('#readingNoteWrap', { state: 'visible' });
  });

  await step('Hỏi tiếp: câu hỏi + trả lời hiện trong khung chat', async () => {
    aiReply = 'Trả lời **tiếp**.';
    await page.fill('#chatInput', 'Còn tình cảm?');
    await page.click('#chatSend');
    await page.waitForFunction(() => document.querySelector('#chatLog .chat-a strong')?.textContent === 'tiếp', null, { timeout: 15000 });
  });

  let link = '';
  await step('Chia sẻ link: copy được link #r=', async () => {
    await page.click('#shareLinkBtn');
    await page.waitForFunction(() => document.getElementById('shareLinkBtn')?.textContent?.includes('Đã copy'), null, { timeout: 5000 });
    link = await page.evaluate(() => navigator.clipboard.readText());
    if (!link.startsWith(BASE + '/#r=')) throw new Error('link: ' + link.slice(0, 60));
  });

  await step('Tải ảnh trải bài: canvas → blob: → tải file PNG', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#shareImgBtn')]);
    if (!/^witches-tarot-.*\.png$/.test(dl.suggestedFilename())) throw new Error('file: ' + dl.suggestedFilename());
  });

  await step('Mở link chia sẻ ở tab mới: đúng câu hỏi, 3 lá, lời giải, ghi chú cảnh báo', async () => {
    const p2 = await ctx.newPage();
    watchErrors(p2, '(p2)');
    await p2.goto(link);
    await p2.waitForURL('**/trai-bai#r=*');
    await p2.waitForSelector('.shared-note', { timeout: 30000 });
    expectEq(await p2.inputValue('#questionInput'), 'Công việc sắp tới?', 'question');
    expectEq(await p2.locator('#spreadList .spread-item').count(), 3, 'rows');
    expectEq(await p2.locator('#aiOutput strong').first().textContent(), 'chào', 'answer');
    await p2.close();
  });

  await step('Nhật ký: có lượt vừa trải, Tải lại mở lại đúng lượt', async () => {
    await page.goto(BASE + '/nhat-ky');
    await page.waitForSelector('#historyList .hist-item', { timeout: 10000 });
    expectEq(await page.locator('#historyList .hist-item').count(), 1, 'items');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('#exportJson')]);
    if (!dl.suggestedFilename().endsWith('.json')) throw new Error('export: ' + dl.suggestedFilename());
    const reload = page.locator('#historyList .hist-item button', { hasText: /Tải lại/ });
    await reload.first().click();
    await page.waitForURL('**/trai-bai');
    await page.waitForFunction(() => document.querySelector('#aiOutput strong')?.textContent === 'chào');
  });

  await step('Có/Không: AI trả phán quyết, hiện lá + giải thích', async () => {
    aiReply = 'PHÁN QUYẾT: CÓ\nVì lá bài **ủng hộ**.';
    await page.goto(BASE + '/yes-no');
    await waitDb(page);
    await page.fill('#yesnoQ', 'Có nên đi không?');
    await page.click('#yesnoBtn');
    await page.waitForFunction(() => document.getElementById('ynVerdict')?.textContent === 'CÓ', null, { timeout: 15000 });
    expectEq(await page.getAttribute('#ynVerdict', 'class'), 'yn-verdict yes', 'verdict class');
  });

  await step('Hiệu ứng đầy đủ (không giảm chuyển động): xào → dừng → máy tự bốc → chia vào bàn trải AI', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
    await watchCsp(ctx2);
    await stubVercel(ctx2);
    await ctx2.addInitScript(() => localStorage.setItem('tarotRitual', '0'));
    const p3 = await ctx2.newPage();
    watchErrors(p3, '(motion)');
    await p3.goto(BASE + '/trai-bai');
    await waitDb(p3);
    await p3.click('.sp-tile[data-k="ppf"]');
    await p3.click('#spreadDrawBtn');
    await p3.waitForSelector('#spreadOrbit.on .riffle-card');
    await p3.waitForTimeout(1500);
    await p3.click('#spreadStopShuffle');
    // bánh xe lăn ra, máy rút 3 lá, lật, rồi chia vào bàn: ~1.7 s + 3×0.46 s + 2.2 s + 1.6 s + 0.45 s + deal
    await p3.waitForFunction(() => document.querySelectorAll('#spreadBoard .board-card.revealed').length === 3, null, { timeout: 20000 });
    expectEq(await p3.locator('#spreadList .spread-item').count(), 3, 'rows after deal');
    // danh sách hiện sau khi chia xong (bản cũ: lá cuối + 560 ms bay + 700 ms)
    await p3.waitForSelector('#spreadList:not(.pending)', { timeout: 5000 });
    await ctx2.close();
  });

  await step('Bầu trời: bản đồ sao vẽ được, đổi vị trí + phóng to không lỗi', async () => {
    await page.goto(BASE + '/bau-troi');
    await page.waitForFunction(() => {
      const c = document.getElementById('skyCanvas');
      if (!c || !c.width) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) lit++;
      return lit > 50;
    }, null, { timeout: 15000 });
    await page.selectOption('#skyLoc', 'danang');
    await page.click('#skyZoomIn');
    await page.click('#skyTgGrid');
    if (!(await page.textContent('#skyInfo'))?.includes('Đà Nẵng')) throw new Error('sky info: ' + (await page.textContent('#skyInfo')));
  });

  await step('Bầu trời: Permissions-Policy cho phép GPS, lấy được vị trí', async () => {
    await ctx.grantPermissions(['geolocation'], { origin: BASE });
    await ctx.setGeolocation({ latitude: 21.03, longitude: 105.85 });
    const allowed = await page.evaluate(() => {
      // @ts-ignore — featurePolicy chỉ có trên Chrome
      const fp = document.featurePolicy;
      return fp ? fp.allowsFeature('geolocation') : true;
    });
    if (!allowed) throw new Error('Permissions-Policy chặn geolocation');
    const lat = await page.evaluate(() => new Promise((ok, no) => navigator.geolocation.getCurrentPosition(p => ok(p.coords.latitude), e => no(new Error(e.message)))));
    expectEq(lat, 21.03, 'latitude');
  });

  await step('Cài đặt trang: nền bầu trời thật + nhạc nền bật/tắt không lỗi', async () => {
    await page.goto(BASE + '/hom-nay');
    await page.evaluate(() => document.getElementById('openSite').click());
    await page.selectOption('#skyMode', 'real');
    await page.selectOption('#ambientMode', 'mystic');
    await page.waitForTimeout(1500);
    await page.selectOption('#ambientMode', 'candle');
    await page.waitForTimeout(800);
    await page.selectOption('#ambientMode', 'off');
    await page.selectOption('#skyMode', 'deco');
    expectEq(await page.evaluate(() => document.documentElement.dataset.sky), 'deco', 'html[data-sky]');
  });

  if (ARG_BASE) {
    // trang SEO tĩnh chỉ có trong bản build (dev server không phục vụ la-bai/)
    await step('Trang SEO /la-bai/ và một trang lá: tải được với CSP thật', async () => {
      for (const p of ['/la-bai/', '/la-bai/rider-waite/10-of-cups/']) {
        const r = await page.goto(BASE + p);
        expectEq(r?.status(), 200, p);
      }
      const r = await page.request.get(BASE + '/trai-bai');
      expectEq(r.status(), 200, '/trai-bai');
    });
  }

  await step('Không vi phạm CSP trên mọi trang', async () => {
    console.log(`      vi phạm CSP: ${cspViolations.length}`);
    if (cspViolations.length) throw new Error(cspViolations.map(v => JSON.stringify(v)).join(' | '));
  });

  await step('Không có lỗi JS/console trong suốt các bước', async () => {
    if (errors.length) throw new Error(errors.join(' | '));
  });
} finally {
  await browser.close();
  await vite?.close();
}
console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả các bước đều qua');
process.exit(failed ? 1 : 0);
