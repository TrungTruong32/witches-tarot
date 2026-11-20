// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSw, precacheList, swVersion } from '../../scripts/build-sw.mjs';

let dist = '';
const put = (rel: string, body = 'x') => {
  const f = join(dist, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, body);
};

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'build-sw-'));
  put('index.html', '<html></html>');
  put('assets/index-abc.js');
  put('assets/sql-wasm-x.wasm');
  for (const f of ['tarot.db', 'card_en.json', 'sky.json', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png', 'cardback.png',
    'cardback-witches.webp', 'og-image.jpg', 'sitemap.xml', 'robots.txt', 'google1.html'])
    put(f);
  put('la-bai/index.html');
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe('precacheList', () => {
  it('vỏ app + assets + dữ liệu; không có la-bai, og-image, SEO', () => {
    const list = precacheList(dist);
    for (const u of ['/', '/index.html', '/assets/index-abc.js', '/assets/sql-wasm-x.wasm', '/tarot.db', '/card_en.json', '/sky.json',
      '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png', '/cardback.png', '/cardback-witches.webp'])
      expect(list).toContain(u);
    for (const u of ['/og-image.jpg', '/la-bai/index.html', '/sitemap.xml', '/robots.txt', '/google1.html', '/sw.js'])
      expect(list).not.toContain(u);
  });
});

describe('swVersion', () => {
  it('đổi khi nội dung tarot.db đổi, giữ nguyên khi không đổi', () => {
    const v1 = swVersion(dist, precacheList(dist));
    expect(swVersion(dist, precacheList(dist))).toBe(v1);
    put('tarot.db', 'y');
    expect(swVersion(dist, precacheList(dist))).not.toBe(v1);
  });

  it('đổi khi tên asset đổi (bản build mới)', () => {
    const v1 = swVersion(dist, precacheList(dist));
    rmSync(join(dist, 'assets/index-abc.js'));
    put('assets/index-def.js');
    expect(swVersion(dist, precacheList(dist))).not.toBe(v1);
  });
});

describe('buildSw', () => {
  it('ghi dist/sw.js với danh sách + phiên bản đã nhúng', async () => {
    const { version } = await buildSw(dist);
    const js = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(js).toContain('wtarot-' + version);
    expect(js).toContain('/assets/index-abc.js');
    expect(js).not.toMatch(/__SW_(ASSETS|VERSION)__/);
  });
});
