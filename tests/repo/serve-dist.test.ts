// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matchesSource, serveDist, type VercelConfig } from '../../scripts/serve-dist.mjs';

describe('matchesSource (tập con path-to-regexp của Vercel)', () => {
  it('khớp toàn bộ đường dẫn, nhóm (.*) và :param', () => {
    expect(matchesSource('/(.*)', '/a/b')).toBe(true);
    expect(matchesSource('/api/(.*)', '/api/ai')).toBe(true);
    expect(matchesSource('/api/(.*)', '/apix/ai')).toBe(false);
    expect(matchesSource('/sw.js', '/sw.js')).toBe(true);
    expect(matchesSource('/sw.js', '/swxjs')).toBe(false); // "." là ký tự thường
    expect(matchesSource('/trai-bai', '/trai-bai/x')).toBe(false);
    expect(matchesSource('/la-bai/:slug', '/la-bai/x')).toBe(true);
    expect(matchesSource('/la-bai/:slug', '/la-bai/x/y')).toBe(false);
  });
});

describe('serveDist áp luật vercel.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'serve-dist-'));
  const config: VercelConfig = {
    rewrites: [{ source: '/trai-bai', destination: '/index.html' }],
    redirects: [{ source: '/old.html', destination: '/', permanent: true }],
    headers: [
      { source: '/(.*)', headers: [{ key: 'X-A', value: 'all' }, { key: 'Content-Security-Policy', value: 'site' }] },
      { source: '/api/(.*)', headers: [{ key: 'Content-Security-Policy', value: 'api' }] },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'immutable' }] },
    ],
  };
  let base = '';
  let close = () => {};
  beforeAll(async () => {
    writeFileSync(join(root, 'index.html'), 'app');
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'a.js'), 'js');
    mkdirSync(join(root, 'la-bai'));
    writeFileSync(join(root, 'la-bai', 'index.html'), 'seo');
    writeFileSync(join(tmpdir(), 'serve-dist-secret.txt'), 'secret');
    const { server } = await serveDist(root, 0, config);
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe('127.0.0.1');
    base = `http://127.0.0.1:${addr.port}`;
    close = () => server.close();
  });
  afterAll(() => {
    close();
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), 'serve-dist-secret.txt'), { force: true });
  });

  it('rewrite route của app, thư mục → index.html, header khớp sau ghi đè header trước', async () => {
    const r = await fetch(base + '/trai-bai');
    expect(await r.text()).toBe('app');
    expect(r.headers.get('x-a')).toBe('all');
    expect(r.headers.get('content-security-policy')).toBe('site');
    expect(await (await fetch(base + '/la-bai/')).text()).toBe('seo');
    expect((await fetch(base + '/assets/a.js')).headers.get('cache-control')).toBe('immutable');
  });

  it('redirect, /api 404 (không chạy hàm) với CSP của api, đường dẫn lạ 404', async () => {
    const r = await fetch(base + '/old.html', { redirect: 'manual' });
    expect(r.status).toBe(308);
    expect(r.headers.get('location')).toBe('/');
    const api = await fetch(base + '/api/ai');
    expect(api.status).toBe(404);
    expect(api.headers.get('content-security-policy')).toBe('api');
    for (const p of ['/khong-co', '/trai-bai/x', '/%2e%2e/serve-dist-secret.txt']) expect((await fetch(base + p)).status, p).toBe(404);
  });
});
