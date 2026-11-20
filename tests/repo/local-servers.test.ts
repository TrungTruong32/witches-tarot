import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_STATIC, serveLegacy } from '../../scripts/root-static.mjs';

describe('root allowlist', () => {
  it('serves card data only', () => {
    for (const ok of ['/tarot.db', '/card_en.json', '/icon-192.png', '/manifest.webmanifest']) expect(ROOT_STATIC.test(ok)).toBe(true);
    for (const bad of ['/.env', '/.env.local', '/test.ipynb', '/Data/tarot.xlsx', '/.git/config', '/tarot.db/../.env', '/local/x.json'])
      expect(ROOT_STATIC.test(bad)).toBe(false);
  });
});

describe('legacy server used by the parity script', () => {
  // Thư mục giả có cả dữ liệu hợp lệ lẫn "bí mật": máy chủ chỉ được trả phần hợp lệ
  const root = mkdtempSync(join(tmpdir(), 'tarot-serve-'));
  let base = '';
  let close = () => {};
  beforeAll(async () => {
    writeFileSync(join(root, 'witches_tarot.html'), '<!doctype html>legacy');
    writeFileSync(join(root, 'tarot.db'), 'db');
    writeFileSync(join(root, '.env'), 'SECRET=1');
    writeFileSync(join(root, 'test.ipynb'), '{"key":"sk-"}');
    mkdirSync(join(root, 'Data'));
    writeFileSync(join(root, 'Data', 'cards.json'), '[]');
    const server = await serveLegacy(root, 0);
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe('127.0.0.1'); // không lắng nghe trên mạng LAN
    base = `http://127.0.0.1:${addr.port}`;
    close = () => server.close();
  });
  afterAll(() => {
    close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves the legacy page and allowlisted data', async () => {
    expect(await (await fetch(base + '/')).text()).toBe('<!doctype html>legacy');
    expect((await fetch(base + '/tarot.db')).status).toBe(200);
  });

  it('refuses secrets, private data and path tricks', async () => {
    for (const p of ['/.env', '/test.ipynb', '/Data/cards.json', '/%2e%2e/%2e%2e/etc/hosts', '/Data'])
      expect((await fetch(base + p)).status, p).toBe(404);
  });
});
