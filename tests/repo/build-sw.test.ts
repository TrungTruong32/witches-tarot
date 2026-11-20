// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSw, cacheNames, precacheLists } from '../../scripts/build-sw.mjs';

let dist = '';
const put = (rel: string, body = 'x') => {
  const f = join(dist, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, body);
};
const html = (ver: string) => `<html><head><meta name="app-version" content="${ver}" /></head><body></body></html>`;
const names = () => cacheNames(dist, precacheLists(dist));

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'build-sw-'));
  put('index.html', html('abc1234 2026-11-20T10:00Z'));
  put('assets/index-abc.js');
  put('assets/sql-wasm-x.wasm');
  put('assets/manifest-h.webmanifest');
  put('assets/cardback-h.png');
  for (const f of ['tarot.db', 'card_en.json', 'sky.json', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png', 'cardback.png',
    'cardback-witches.webp', 'og-image.jpg', 'sitemap.xml', 'robots.txt', 'google1.html'])
    put(f);
  put('la-bai/index.html');
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe('precacheLists', () => {
  it('app = vỏ + /assets/*; data = dữ liệu bài + icon + mặt lưng còn dùng; không có la-bai, og-image, SEO, bản trùng', () => {
    const { app, data } = precacheLists(dist);
    expect(app).toEqual(['/', '/index.html', '/assets/cardback-h.png', '/assets/index-abc.js', '/assets/manifest-h.webmanifest', '/assets/sql-wasm-x.wasm']);
    expect([...data].sort()).toEqual(['/apple-touch-icon.png', '/card_en.json', '/cardback-witches.webp', '/icon-192.png', '/sky.json', '/tarot.db']);
    // manifest/cardback ở gốc: HTML/CSS dùng bản có hash trong /assets → không precache bản gốc
    for (const u of ['/og-image.jpg', '/manifest.webmanifest', '/cardback.png', '/la-bai/index.html', '/sitemap.xml', '/robots.txt', '/google1.html', '/sw.js'])
      expect([...app, ...data]).not.toContain(u);
  });
});

describe('cacheNames', () => {
  it('chỉ đổi thẻ app-version (giờ build) → cả hai tên giữ nguyên', () => {
    const a = names();
    put('index.html', html('def5678 2026-11-21T09:30Z'));
    expect(names()).toEqual(a);
    expect(a.app).toMatch(/^wtarot-app-[0-9a-f]{16}$/);
    expect(a.data).toMatch(/^wtarot-data-[0-9a-f]{16}$/);
  });

  it('đổi nội dung tarot.db → chỉ đổi tên cache data', () => {
    const a = names();
    put('tarot.db', 'y');
    const b = names();
    expect(b.app).toBe(a.app);
    expect(b.data).not.toBe(a.data);
  });

  it('đổi tên asset (bản build mới) → chỉ đổi tên cache app', () => {
    const a = names();
    rmSync(join(dist, 'assets/index-abc.js'));
    put('assets/index-def.js');
    const b = names();
    expect(b.app).not.toBe(a.app);
    expect(b.data).toBe(a.data);
  });

  it('đổi phần khác của index.html → đổi tên cache app', () => {
    const a = names();
    put('index.html', html('abc1234 2026-11-20T10:00Z').replace('<body>', '<body><p>x</p>'));
    expect(names().app).not.toBe(a.app);
  });
});

describe('buildSw', () => {
  it('ghi dist/sw.js với hai tên cache + danh sách đã nhúng', async () => {
    const r = await buildSw(dist);
    const js = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(js).toContain(r.app);
    expect(js).toContain(r.data);
    expect(js).toContain('/assets/index-abc.js');
    expect(js).not.toMatch(/__SW_[A-Z_]+__/);
  });
});
