// Kiểm tra nhanh các luồng chính trên trình duyệt thật (Chrome qua Playwright) với dữ liệu bài thật ở gốc repo.
// AI miễn phí (/api/ai) được giả lập bằng page.route nên không tốn lượt, không cần mạng.
// Chạy: node scripts/smoke-flows.mjs        → in từng bước PASS/FAIL, thoát mã 1 nếu có bước lỗi.
import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';

const vite = await createVite({ server: { port: 5312, strictPort: true }, logLevel: 'error' });
await vite.listen();
const BASE = 'http://localhost:5312';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
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

const errors = [];
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
}
const expectEq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const waitDb = p => p.waitForFunction(() => !document.querySelector('#drawBtn, #spreadDrawBtn, #yesnoBtn')?.disabled, null, { timeout: 30000 });

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

  await step('Mở link chia sẻ ở tab mới: đúng câu hỏi, 3 lá, lời giải, ghi chú cảnh báo', async () => {
    const p2 = await ctx.newPage();
    p2.on('pageerror', e => errors.push('pageerror(p2): ' + e.message));
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
    await ctx2.addInitScript(() => localStorage.setItem('tarotRitual', '0'));
    const p3 = await ctx2.newPage();
    p3.on('pageerror', e => errors.push('pageerror(motion): ' + e.message));
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

  await step('Không có lỗi JS/console trong suốt các bước', async () => {
    if (errors.length) throw new Error(errors.join(' | '));
  });
} finally {
  await browser.close();
  await vite.close();
}
console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả các bước đều qua');
process.exit(failed ? 1 : 0);
