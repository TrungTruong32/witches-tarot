// So ảnh chụp bản cũ (witches_tarot.html) và bản React cho các màn hình của Kế hoạch 2a/2b (Bốc bài cố ý khác — spec §5.8 — nên không so).
// Chạy: node scripts/parity-screens.mjs   (cần dữ liệu bài ở gốc repo + Chrome đã cài; mạng để tải sql.js/fonts cho bản cũ)
// Ghi ảnh vào .superpowers/parity/<tên>-{legacy,react,diff}.png và in % điểm ảnh khác nhau.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { serveLegacy } from './root-static.mjs';

const OUT = '.superpowers/parity';
mkdirSync(OUT, { recursive: true });
const ROOT = resolve('.');

// Bản cũ: chỉ witches_tarot.html + danh sách trắng dữ liệu, chỉ trên 127.0.0.1 (không lộ .env/Data/ ra mạng LAN)
const legacyServer = await serveLegacy(ROOT, 5310);
const vite = await createVite({ server: { port: 5311, strictPort: true }, logLevel: 'error' });
await vite.listen();

const LEGACY = 'http://127.0.0.1:5310';
const REACT = 'http://localhost:5311';

// Giống nhau cho cả hai: Math.random cố định, tắt animation/transition, ẩn nền sao động (Kế hoạch 2c)
const INIT = `(() => { let s = 42; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); })();`;
const FREEZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
#bgStars,#bgAura{display:none!important}`;

const browser = await chromium.launch({ channel: 'chrome' });

/** Mở một màn hình trên mỗi bản, chờ ổn định, chụp. `go` = { legacy(page), react(page) } */
async function shot(name, { width, height, lang, theme, go }) {
  const pages = {};
  for (const [which, base] of [['legacy', LEGACY], ['react', REACT]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript(INIT);
    await ctx.addInitScript(([l, t]) => {
      localStorage.setItem('tarotLang', l);
      if (t) localStorage.setItem('theme', t); else localStorage.removeItem('theme');
      localStorage.setItem('tarotCloudSave', '0');
    }, [lang, theme]);
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.addStyleTag({ content: FREEZE_CSS });
    await go[which](page);
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.fonts.ready);
    // Chờ mọi ảnh (ảnh lá bài tải chậm) xong để kết quả không phụ thuộc thời điểm chụp
    await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    const file = `${OUT}/${name}-${which}.png`;
    await page.screenshot({ path: file, fullPage: false });
    pages[which] = file;
    await ctx.close();
  }
  const a = PNG.sync.read(readFileSync(pages.legacy));
  const b = PNG.sync.read(readFileSync(pages.react));
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
  writeFileSync(`${OUT}/${name}-diff.png`, PNG.sync.write(diff));
  const pct = ((100 * n) / (a.width * a.height)).toFixed(2);
  console.log(`${pct.padStart(6)}%  ${name}`);
  return { name, pct: +pct };
}

const waitDb = page => page.waitForFunction(() => {
  const st = document.getElementById('bootStatus');
  return !st || getComputedStyle(st).display === 'none';
}, null, { timeout: 30000 }).catch(() => {});

// Thao tác vào từng màn hình. Bản cũ: bấm trên trang mở đầu; bản mới: vào thẳng đường dẫn.
const legacyEnter = mode => async page => {
  await page.waitForFunction(() => !document.getElementById('landingEnter')?.disabled, null, { timeout: 30000 });
  // Trên điện thoại các nút này nằm trong menu ẩn → bấm qua DOM
  await page.evaluate(m => document.querySelector(`.lt-nav [data-go="${m}"]`).click(), mode);
  await waitDb(page);
};
const reactGo = path => async page => { await page.goto(REACT + path); await waitDb(page); };

// Trải 3 lá "Quá khứ · Hiện tại · Tương lai" bằng ô tự thêm lá (giống nhau, không ngẫu nhiên) → chụp danh sách + bàn trải
const addThree = async page => {
  await page.evaluate(() => document.querySelector('.sp-tile[data-k="ppf"]').click());
  await page.evaluate(() => { document.querySelector('details.manual-add').open = true; });
  for (const q of ['fool', 'magician', 'tower']) {
    await page.fill('#pickerInput', q);
    await page.waitForTimeout(150);
    await page.press('#pickerInput', 'Enter');
  }
  await page.evaluate(() => document.getElementById('spreadBoard')?.scrollIntoView({ block: 'center' }));
};

const SCREENS = {
  landing: { legacy: async p => { await p.waitForTimeout(300); }, react: async p => { await p.waitForTimeout(300); } },
  daily: { legacy: legacyEnter('daily'), react: reactGo('/hom-nay') },
  browse: { legacy: legacyEnter('browse'), react: reactGo('/tra-cuu') },
  drawer: {
    legacy: async p => { await legacyEnter('daily')(p); await p.click('#navToggle').catch(() => {}); },
    react: async p => { await reactGo('/hom-nay')(p); await p.click('#navToggle').catch(() => {}); },
  },
  site: {
    legacy: async p => { await legacyEnter('daily')(p); await p.evaluate(() => document.getElementById('openSite').click()); },
    react: async p => { await reactGo('/hom-nay')(p); await p.evaluate(() => document.getElementById('openSite').click()); },
  },
  reading: { legacy: legacyEnter('reading'), react: reactGo('/trai-bai') },
  reading3: { legacy: async p => { await legacyEnter('reading')(p); await addThree(p); }, react: async p => { await reactGo('/trai-bai')(p); await addThree(p); } },
  history: {
    legacy: async p => { await legacyEnter('daily')(p); await p.evaluate(() => document.getElementById('modeHistory').click()); await p.waitForTimeout(400); },
    react: async p => { await reactGo('/nhat-ky')(p); await p.waitForTimeout(400); },
  },
  yesno: { legacy: legacyEnter('yesno'), react: reactGo('/yes-no') },
  ai: {
    legacy: async p => { await legacyEnter('daily')(p); await p.evaluate(() => document.getElementById('openSettings').click()); },
    react: async p => { await reactGo('/hom-nay')(p); await p.evaluate(() => document.getElementById('openSettings').click()); },
  },
};

const only = process.argv[2];
const results = [];
try {
  for (const [vw, vh, tag] of [[390, 844, 'phone'], [1440, 900, 'desk']])
    for (const lang of ['vi', 'en'])
      for (const theme of ['', 'light'])
        for (const [screen, go] of Object.entries(SCREENS)) {
          if (screen === 'drawer' && tag === 'desk') continue; // desktop dùng thanh vòm, đã có trong các màn khác
          const name = `${screen}-${tag}-${lang}-${theme || 'dark'}`;
          if (only && !name.includes(only)) continue;
          results.push(await shot(name, { width: vw, height: vh, lang, theme, go }));
        }
} finally {
  await browser.close();
  await vite.close();
  legacyServer.close();
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 2));
