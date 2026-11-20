// So ảnh chụp bản cũ (witches_tarot.html) và bản React cho các màn hình của Kế hoạch 2a.
// Chạy: node scripts/parity-screens.mjs   (cần dữ liệu bài ở gốc repo + Chrome đã cài; mạng để tải sql.js/fonts cho bản cũ)
// Ghi ảnh vào .superpowers/parity/<tên>-{legacy,react,diff}.png và in % điểm ảnh khác nhau.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const OUT = '.superpowers/parity';
mkdirSync(OUT, { recursive: true });
const ROOT = resolve('.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

// Bản cũ: phục vụ thư mục gốc, "/" → witches_tarot.html
const legacyServer = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/witches_tarot.html';
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
  res.end(readFileSync(f));
}).listen(5310);
const vite = await createVite({ server: { port: 5311, strictPort: true }, logLevel: 'error' });
await vite.listen();

const LEGACY = 'http://localhost:5310';
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
  await page.click(`.lt-nav [data-go="${mode}"]`);
  await waitDb(page);
};
const reactGo = path => async page => { await page.goto(REACT + path); await waitDb(page); };

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
