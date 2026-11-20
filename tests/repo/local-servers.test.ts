import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT_STATIC } from '../../scripts/root-static.mjs';

describe('local servers never expose secrets', () => {
  it('the root allowlist serves card data only', () => {
    for (const ok of ['/tarot.db', '/card_en.json', '/icon-192.png', '/manifest.webmanifest']) expect(ROOT_STATIC.test(ok)).toBe(true);
    for (const bad of ['/.env', '/.env.local', '/test.ipynb', '/Data/tarot.xlsx', '/.git/config', '/tarot.db/../.env', '/local/x.json'])
      expect(ROOT_STATIC.test(bad)).toBe(false);
  });
  it('the parity script binds to loopback and uses the allowlist', () => {
    const src = readFileSync('scripts/parity-screens.mjs', 'utf8');
    expect(src).toContain(".listen(5310, '127.0.0.1')");
    expect(src).toContain('ROOT_STATIC.test(p)');
  });
});
