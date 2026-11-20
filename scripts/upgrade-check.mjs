// Kiểm tra nâng cấp THẬT từ bản cũ (một file HTML + sw.js 'wtarot-v9') lên bản React, CÙNG một origin, trên Chrome thật.
// Pha A: cổng P phục vụ bản cũ đóng băng (tests/legacy/witches_tarot.legacy.html ở "/", sw.js cũ lấy từ git d5af282,
//        dữ liệu gốc theo danh sách trắng). Mở trang, chờ SW cũ điều khiển, rồi TẠO dữ liệu người dùng bằng chính code cũ:
//        lượt trải bài trong IndexedDB `witchesTarotDecks` v2 (saveReading), theme / cardBack / tarotLang qua control cũ,
//        dailyNote:<ngày> qua ô ghi chú cũ, tarotDeviceId do deviceId() cũ sinh, cache wtarot-v9 do SW cũ điền.
//        Cũng tạo 3 link chia sẻ bằng encodeShare(buildShareData()) của bản cũ (ppf có lá ngược, celtic, tự do 5 lá).
// Pha B: tắt máy chủ cũ, phục vụ dist/ (serveDist, đúng luật vercel.json) trên CÙNG cổng P → cùng origin. Tải lại:
//        SW mới phải điều khiển trang, chỉ còn cache wtarot-app-* + wtarot-data-*, /nhat-ky có lượt cũ, cài đặt được áp,
//        /hom-nay có ghi chú cũ, tarotDeviceId không đổi. Mở từng link chia sẻ cũ trên bản mới và so với bản cũ.
//        Cuối cùng tắt máy chủ + offline: /tra-cuu liệt kê lá, /boc-bai xòe được bài.
// Mạng: chỉ 127.0.0.1. sql.js của bản cũ (cdnjs) được trả từ node_modules/sql.js (cùng bản 1.10.3); host ngoài khác bị chặn.
// Chạy: node scripts/upgrade-check.mjs   (cần `npm run build` trước) → in PASS/FAIL từng bước, thoát mã 1 nếu có bước lỗi.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { serveLegacy } from './root-static.mjs';
import { serveDist } from './serve-dist.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(REPO, 'dist');
const SQLJS = join(REPO, 'node_modules', 'sql.js', 'dist');
/** Commit cuối còn sw.js của bản cũ (cache 'wtarot-v9'). */
const LEGACY_SW_COMMIT = 'd5af282';

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error('Thiếu dist/sw.js — chạy `npm run build` trước.');
  process.exit(1);
}
const legacySw = execFileSync('git', ['show', `${LEGACY_SW_COMMIT}:sw.js`], { cwd: REPO, encoding: 'utf8' });
if (!legacySw.includes("'wtarot-v9'")) {
  console.error(`sw.js ở ${LEGACY_SW_COMMIT} không phải bản wtarot-v9`);
  process.exit(1);
}

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
};
const expectEq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: mong đợi ${JSON.stringify(b)}, nhận ${JSON.stringify(a)}`);
};
const closeServer = async s => { s.closeAllConnections(); await new Promise(ok => s.close(ok)); };
const norm = t => String(t || '').replace(/\s+/g, ' ').trim();

// ---------- Pha A: bản cũ ----------
const legacyServer = await serveLegacy(REPO, 0, { '/sw.js': { body: legacySw, type: 'text/javascript' } });
const PORT = legacyServer.address().port;
const BASE = 'http://127.0.0.1:' + PORT;
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

// context.route (không phải page.route) để chặn được cả request do service worker gửi đi
await ctx.route('**/*', route => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') {
    // /api/* không có ở máy: trả 200 rỗng cho đỡ lỗi mạng (lưu đám mây đã tắt, AI không được gọi)
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.continue();
  }
  const m = /^\/ajax\/libs\/sql\.js\/1\.10\.3\/(sql-wasm\.(?:js|wasm))$/.exec(u.pathname);
  if (u.hostname === 'cdnjs.cloudflare.com' && m) {
    return route.fulfill({
      status: 200,
      contentType: m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(join(SQLJS, m[1])),
    });
  }
  return route.abort();
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

/** Dữ liệu ghi lại ở pha A để so ở pha B */
const legacy = { deviceId: '', note: '', theme: 'rose', cardBack: '', cardBackCss: '', reading: null, links: [] };

try {
  await step('Pha A: bản cũ mở trên ' + BASE + ', SW cũ (wtarot-v9) điều khiển trang, DB đã nạp', async () => {
    await page.goto(BASE + '/');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    // `db`, `selectedDeck` là let ở cấp cao nhất của script cũ → chỉ đọc được bằng biểu thức chuỗi
    await page.waitForFunction('typeof db !== "undefined" && db !== null && !!selectedDeck', null, { timeout: 30000 });
  });

  await step('Pha A: tạo dữ liệu người dùng bằng code cũ (nhật ký IDB, deviceId, cài đặt, ghi chú hôm nay)', async () => {
    // tắt lưu đám mây (cài đặt của bản cũ) để saveReading không gửi đi đâu
    await page.evaluate(() => localStorage.setItem('tarotCloudSave', '0'));
    legacy.deviceId = await page.evaluate('deviceId()');
    if (!/^[0-9a-f-]{36}$/i.test(legacy.deviceId)) throw new Error('deviceId cũ: ' + legacy.deviceId);

    // lượt trải bài: 3 lá Quá khứ/Hiện tại/Tương lai, lá giữa ngược → saveReading ghi vào witchesTarotDecks v2
    legacy.reading = await page.evaluate(`(async () => {
      const ids = db.exec("SELECT id FROM cards WHERE deck = '" + selectedDeck.replace(/'/g, "''") + "' ORDER BY id LIMIT 3")[0].values.map(r => r[0]);
      const cards = ids.map((id, i) => Object.assign(cardByIdAnyDeck(id), { orientation: i === 1 ? 'nguoc' : 'xuoi' }));
      const text = 'Lời giải **bản cũ** cho nhật ký.\\n\\n- ý một\\n- ý hai';
      loadReading({ question: 'Câu hỏi từ bản cũ?', deck: selectedDeck, text, cards, spread: 'ppf' });
      await saveReading(text);
      const all = await idbAllReadings();
      return { count: all.length, question: all[0] && all[0].question, spread: all[0] && all[0].spread, cards: all[0] ? all[0].cards.map(c => c.ten) : [] };
    })()`);
    expectEq(legacy.reading.count, 1, 'số lượt trong IndexedDB cũ');
    expectEq(legacy.reading.spread, 'ppf', 'kiểu trải lưu trong IndexedDB cũ');

    // ghi chú hôm nay: gõ vào ô của bản cũ → listener cũ lưu dailyNote:<dailyKey()>
    legacy.note = 'Ghi chú hôm nay từ bản cũ ✦';
    const key = await page.evaluate(note => {
      const ta = document.getElementById('dailyNote');
      ta.value = note;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return Object.keys(localStorage).find(k => k.startsWith('dailyNote:'));
    }, legacy.note);
    if (!key) throw new Error('bản cũ không lưu dailyNote');
    console.log('      ' + key + ', tarotDeviceId ' + legacy.deviceId);
  });

  await step('Pha A: tạo 3 link chia sẻ bằng encodeShare(buildShareData()) của bản cũ', async () => {
    const specs = [
      { name: 'ppf, lá thứ 2 ngược', spread: 'ppf', n: 3, rev: [1], q: 'Chia sẻ ppf?' },
      { name: 'celtic 10 lá', spread: 'celtic', n: 10, rev: [0, 4, 9], q: 'Chia sẻ Celtic?' },
      { name: 'tự do 5 lá', spread: 'free', n: 5, rev: [2, 3], q: 'Chia sẻ tự do?' },
    ];
    for (const s of specs) {
      const r = await page.evaluate(`(async () => {
        const s = ${JSON.stringify(s)};
        const ids = db.exec("SELECT id FROM cards WHERE deck = '" + selectedDeck.replace(/'/g, "''") + "' ORDER BY id DESC LIMIT " + s.n)[0].values.map(r => r[0]);
        const cards = ids.map((id, i) => Object.assign(cardByIdAnyDeck(id), { orientation: s.rev.includes(i) ? 'nguoc' : 'xuoi' }));
        loadReading({ question: s.q, deck: selectedDeck, text: 'Lời giải **' + s.spread + '** từ bản cũ.\\n\\n1. thứ nhất\\n2. thứ hai', cards, spread: s.spread });
        const data = buildShareData();
        return {
          hash: '#r=' + await encodeShare(data),
          p: data.p, q: data.q, o: data.c.map(c => c[1] ? 'nguoc' : 'xuoi'),
          names: spread.map(c => c.ten),
          answer: document.getElementById('aiOutput').textContent,
        };
      })()`);
      expectEq(r.p, s.spread, s.name + ': khoá kiểu trải trong link');
      expectEq(r.o.length, s.n, s.name + ': số lá trong link');
      expectEq(r.o.filter(o => o === 'nguoc').length, s.rev.length, s.name + ': số lá ngược trong link');
      // lời giải bản cũ hiển thị phải có chữ thật (không so hai chuỗi rỗng với nhau)
      if (!r.answer.includes(s.spread + ' từ bản cũ')) throw new Error(s.name + ': bản cũ không hiện lời giải');
      legacy.links.push({ ...s, ...r });
      console.log(`      ${s.name}: ${r.hash.length} ký tự`);
    }
  });

  await step('Pha A: đổi theme / mặt lưng / ngôn ngữ bằng control của bản cũ', async () => {
    const r = await page.evaluate(theme => {
      const fire = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      fire('themeSel', theme);
      const cb = document.getElementById('cardBackSel');
      const other = Array.from(cb.options).map(o => o.value).find(v => v !== cb.value);
      fire('cardBackSel', other);
      fire('langSel', 'en');
      return {
        cardBack: other,
        css: document.documentElement.style.getPropertyValue('--cardback'),
        ls: { theme: localStorage.getItem('theme'), cardBack: localStorage.getItem('cardBack'), lang: localStorage.getItem('tarotLang') },
      };
    }, legacy.theme);
    expectEq(r.ls, { theme: legacy.theme, cardBack: r.cardBack, lang: 'en' }, 'localStorage do bản cũ ghi');
    legacy.cardBack = r.cardBack;
    legacy.cardBackCss = r.css;
  });

  await step('Pha A: SW cũ đã điền cache wtarot-v9 (có "/" và /tarot.db)', async () => {
    const r = await page.evaluate(async () => {
      const keys = await caches.keys();
      const c = await caches.open('wtarot-v9');
      return { keys, shell: !!(await c.match('/')), db: !!(await c.match('/tarot.db')) };
    });
    expectEq(r, { keys: ['wtarot-v9'], shell: true, db: true }, 'cache bản cũ');
  });

  // ---------- Pha B: bản React trên CÙNG origin ----------
  await closeServer(legacyServer);
  let dist;
  for (let i = 0; ; i++) {
    try { dist = await serveDist(DIST, PORT); break; }
    catch (e) { if (i >= 20) throw e; await new Promise(r => setTimeout(r, 250)); }
  }
  const { server } = dist;
  if (server.address().port !== PORT) throw new Error('serveDist không lên đúng cổng ' + PORT);

  // cờ controllerchange: scriptURL của SW cũ và mới đều là /sw.js nên không phân biệt được bằng URL
  await ctx.addInitScript(() => {
    navigator.serviceWorker?.addEventListener('controllerchange', () => { sessionStorage.setItem('upgradeControllerChange', '1'); });
  });
  // nghi thức mở bài của bản mới (không có ở dữ liệu cũ) → tắt để bước bốc bài không bị chặn
  await page.evaluate(() => localStorage.setItem('tarotRitual', '0'));

  await step('Pha B: tải lại trên cùng origin → SW mới điều khiển trang (controllerchange), chỉ còn wtarot-app-* + wtarot-data-*', async () => {
    await page.reload();
    let keys = [];
    let changed = false;
    for (let t = Date.now(); Date.now() - t < 30000; await new Promise(r => setTimeout(r, 250))) {
      try {
        keys = (await page.evaluate(() => caches.keys())).sort();
        changed = await page.evaluate(() => sessionStorage.getItem('upgradeControllerChange') === '1' && !!navigator.serviceWorker.controller);
      } catch { /* trang đang tải lại */ }
      if (changed && keys.length === 2 && keys.some(k => /^wtarot-app-[0-9a-f]{16}$/.test(k)) && keys.some(k => /^wtarot-data-[0-9a-f]{16}$/.test(k))) break;
    }
    if (!changed) throw new Error('không có controllerchange sang SW mới');
    if (keys.length !== 2 || !keys.some(k => /^wtarot-app-[0-9a-f]{16}$/.test(k)) || !keys.some(k => /^wtarot-data-[0-9a-f]{16}$/.test(k)))
      throw new Error('caches: ' + JSON.stringify(keys));
    console.log('      caches: ' + keys.join(', '));
    // trang giờ là bản React (có thẻ app-version)
    await page.reload();
    const v = await page.evaluate(() => document.querySelector('meta[name="app-version"]')?.getAttribute('content') || '');
    if (!v) throw new Error('trang sau nâng cấp không phải bản React (thiếu app-version)');
  });

  const waitDb = () => page.waitForFunction(() => {
    const st = document.getElementById('bootStatus');
    return !!st && getComputedStyle(st).display === 'none';
  }, null, { timeout: 30000 });

  await step('Pha B: /nhat-ky liệt kê lượt trải bài của bản cũ (IndexedDB witchesTarotDecks)', async () => {
    await page.goto(BASE + '/nhat-ky');
    await page.waitForSelector('#historyList .hist-item', { timeout: 15000 });
    const qs = await page.locator('#historyList .hist-item .q').allTextContents();
    expectEq(qs, ['Câu hỏi từ bản cũ?'], 'câu hỏi trong nhật ký');
  });

  await step('Pha B: cài đặt cũ được áp (html[data-theme], --cardback, ngôn ngữ en)', async () => {
    await page.goto(BASE + '/tra-cuu');
    await waitDb();
    const r = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      lang: document.documentElement.getAttribute('lang'),
      cardBack: localStorage.getItem('cardBack'),
      css: document.documentElement.style.getPropertyValue('--cardback'),
    }));
    expectEq(r.theme, legacy.theme, 'html[data-theme]');
    expectEq(r.lang, 'en', 'html[lang]');
    expectEq(r.cardBack, legacy.cardBack, 'localStorage cardBack');
    expectEq(norm(r.css), norm(legacy.cardBackCss), '--cardback (so với bản cũ)');
    console.log(`      theme=${r.theme} lang=${r.lang} cardBack=${r.cardBack}`);
  });

  await step('Pha B: /hom-nay hiện ghi chú hôm nay của bản cũ', async () => {
    await page.goto(BASE + '/hom-nay');
    await page.waitForSelector('#dailyNote', { timeout: 15000 });
    expectEq(await page.inputValue('#dailyNote'), legacy.note, 'ghi chú');
  });

  await step('Pha B: tarotDeviceId giữ nguyên', async () => {
    expectEq(await page.evaluate(() => localStorage.getItem('tarotDeviceId')), legacy.deviceId, 'tarotDeviceId');
  });

  // Link chia sẻ của bản cũ: mở trong context mới (tiếng Việt, không SW) để so chữ với bản cũ
  const shareCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await shareCtx.route('**/*', route => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
  await shareCtx.addInitScript(() => { localStorage.setItem('tarotRitual', '0'); localStorage.setItem('tarotCloudSave', '0'); });
  for (const l of legacy.links) {
    await step(`Pha B: link chia sẻ cũ (${l.name}) mở đúng trên bản mới`, async () => {
      const p = await shareCtx.newPage();
      p.on('pageerror', e => errors.push('pageerror(share): ' + e.message));
      try {
        await p.goto(BASE + '/' + l.hash);
        await p.waitForURL('**/trai-bai#r=*', { timeout: 15000 });
        await p.waitForSelector('.shared-note', { timeout: 30000 });
        const r = await p.evaluate(() => {
          const out = document.getElementById('aiOutput').cloneNode(true);
          out.querySelectorAll('.shared-note').forEach(n => n.remove());
          return {
            q: document.getElementById('questionInput').value,
            k: document.querySelector('.sp-tile[aria-checked="true"]')?.getAttribute('data-k') ?? null,
            o: Array.from(document.querySelectorAll('#spreadList .spread-item')).map(row => row.querySelector('.orient button.on')?.getAttribute('data-o') ?? null),
            names: Array.from(document.querySelectorAll('#spreadList .spread-item .name strong')).map(s => s.textContent),
            answer: out.textContent,
          };
        });
        expectEq(r.q, l.q, 'câu hỏi');
        expectEq(r.k, l.spread, 'kiểu trải');
        expectEq(r.o, l.o, 'số lá + chiều xuôi/ngược');
        l.names.forEach((n, i) => { if (!String(r.names[i] || '').includes(n)) throw new Error(`lá ${i + 1}: mong đợi "${n}", nhận "${r.names[i]}"`); });
        expectEq(norm(r.answer), norm(l.answer), 'lời giải (so với bản cũ hiển thị)');
      } finally { await p.close(); }
    });
  }
  await shareCtx.close();

  // ---------- Offline: tắt hẳn máy chủ ----------
  await closeServer(server);
  await ctx.setOffline(true);

  await step('Offline: /tra-cuu liệt kê lá từ tarot.db đã cache', async () => {
    const res = await page.goto(BASE + '/tra-cuu');
    if (!res || !res.fromServiceWorker()) throw new Error('trang không đến từ SW');
    await waitDb();
    await page.waitForSelector('#cardsList .card-item', { timeout: 20000 });
    const n = await page.locator('#cardsList .card-item').count();
    if (n < 22) throw new Error('chỉ có ' + n + ' lá');
    console.log('      ' + n + ' lá');
  });

  await step('Offline: /boc-bai chọn kiểu trải và xòe bài được', async () => {
    await page.goto(BASE + '/boc-bai');
    await waitDb();
    await page.click('#drawSpreadPicker .sp-tile[data-k="ppf"]');
    await page.click('#pickBtn');
    await page.waitForSelector('#drawFan .wcard', { timeout: 15000 });
  });

  await step('Không có lỗi JS trên trang (cả bản cũ lẫn bản mới)', async () => {
    if (errors.length) throw new Error(errors.join(' | '));
  });
} catch (e) {
  failed++;
  console.log('FAIL  (dừng giữa chừng) ' + String(e.message || e).split('\n')[0]);
} finally {
  await browser.close();
  if (legacyServer.listening) legacyServer.close();
}
console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả PASS');
process.exit(failed ? 1 : 0);
