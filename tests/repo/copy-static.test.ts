import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyStatic } from '../../scripts/copy-static.mjs';

let root = '';
let dist = '';
const put = (rel: string, body = 'x') => {
  const f = join(root, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, body);
};

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'copy-static-'));
  root = join(base, 'root');
  dist = join(base, 'dist');
  mkdirSync(root);
  mkdirSync(dist);
  put('tarot.db');
  put('card_en.json');
  put('sky.json');
  put('cardback.png');
  put('manifest.webmanifest');
  put('sitemap.xml');
  put('robots.txt');
  put('google09f883fd3a910deb.html');
  put('la-bai/index.html');
  put('la-bai/rider-waite/the-fool.html');
  put('.env', 'SECRET=1');
  put('test.ipynb');
  put('Data/a.json');
  put('local/b.txt');
});
afterEach(() => rmSync(join(root, '..'), { recursive: true, force: true }));

describe('copyStatic', () => {
  it('chép dữ liệu, SEO và la-bai vào dist', () => {
    copyStatic(root, dist);
    for (const f of ['tarot.db', 'card_en.json', 'sky.json', 'cardback.png', 'manifest.webmanifest', 'sitemap.xml', 'robots.txt', 'google09f883fd3a910deb.html', 'la-bai/index.html', 'la-bai/rider-waite/the-fool.html'])
      expect(existsSync(join(dist, f)), f).toBe(true);
  });

  it('không bao giờ chép .env, *.ipynb, Data/, local/', () => {
    copyStatic(root, dist);
    for (const f of ['.env', 'test.ipynb', 'Data', 'local']) expect(existsSync(join(dist, f)), f).toBe(false);
  });

  it('thiếu tarot.db thì lỗi', () => {
    rmSync(join(root, 'tarot.db'));
    expect(() => copyStatic(root, dist)).toThrow(/tarot\.db/);
  });
});
