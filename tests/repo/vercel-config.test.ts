// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { headersFor, matchesSource, rewriteFor, serveDist, type VercelConfig } from '../../scripts/serve-dist.mjs';

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
const APP_ROUTES = ['/hom-nay', '/tra-cuu', '/boc-bai', '/trai-bai', '/nhat-ky', '/yes-no', '/bau-troi'];
// CSP của /api giữ nguyên như bản cũ (hàm API không trả HTML, chặn hết)
const API_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

describe('vercel.json cho bản build Vite', () => {
  it('build bằng npm run build, xuất dist/, không framework preset', () => {
    expect(config.buildCommand).toBe('npm run build');
    expect(config.outputDirectory).toBe('dist');
    expect(config.framework).toBeNull();
  });

  it('mỗi route của app rewrite về /index.html', () => {
    for (const r of APP_ROUTES) expect(rewriteFor(config, r), r).toBe('/index.html');
    expect(rewriteFor(config, '/')).toBeNull(); // dist/index.html tự phục vụ "/"
  });

  it('không rewrite nào nuốt /api, /la-bai, sitemap, robots, google*.html, đường dẫn lạ', () => {
    const untouched = ['/api/x', '/api/ai', '/la-bai/x', '/la-bai/', '/sitemap.xml', '/robots.txt', '/google09f883fd3a910deb.html', '/khong-co', '/trai-bai/x'];
    for (const p of untouched)
      for (const r of config.rewrites ?? []) expect(matchesSource(r.source, p), `${r.source} ~ ${p}`).toBe(false);
  });

  it('giữ redirect /witches_tarot.html → /', () => {
    expect(config.redirects).toContainEqual({ source: '/witches_tarot.html', destination: '/', permanent: true });
  });

  it('mỗi route của app có redirect vĩnh viễn /x/ → /x (không dùng trailingSlash)', () => {
    for (const r of APP_ROUTES) expect(config.redirects, r).toContainEqual({ source: r + '/', destination: r, permanent: true });
    for (const x of config.redirects ?? []) expect(matchesSource(x.source, '/la-bai/'), x.source).toBe(false);
  });

  it('CSP của /api giữ nguyên, các header bảo mật vẫn có ở mọi trang', () => {
    expect(headersFor(config, '/api/ai')['Content-Security-Policy']).toBe(API_CSP);
    const h = headersFor(config, '/trai-bai');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Content-Security-Policy']).toMatch(/frame-ancestors 'none'/);
  });

  it('/assets/* cache vĩnh viễn; /sw.js và trang HTML không bị cache immutable', () => {
    expect(headersFor(config, '/assets/index-abc.js')['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(headersFor(config, '/sw.js')['Cache-Control']).toBe('no-cache');
    for (const p of ['/sw.js', '/', '/index.html', '/trai-bai', '/tarot.db', '/la-bai/'])
      expect(headersFor(config, p)['Cache-Control'] ?? '', p).not.toMatch(/immutable/);
  });

  it('không bật cleanUrls/trailingSlash (giữ URL /la-bai/.../ chuẩn)', () => {
    expect(config.cleanUrls).toBeUndefined();
    expect(config.trailingSlash).toBeUndefined();
  });
});

describe('vercel.json thật qua serve-dist', () => {
  const root = mkdtempSync(join(tmpdir(), 'vercel-config-'));
  let base = '';
  let close = () => {};
  beforeAll(async () => {
    writeFileSync(join(root, 'index.html'), 'app');
    mkdirSync(join(root, 'la-bai'));
    writeFileSync(join(root, 'la-bai', 'index.html'), 'seo');
    const { server } = await serveDist(root, 0, config);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => {
    close();
    rmSync(root, { recursive: true, force: true });
  });

  it('/x/ → 308 về /x; /x trả app; /la-bai/ không bị redirect', async () => {
    for (const r of APP_ROUTES) {
      const res = await fetch(base + r + '/', { redirect: 'manual' });
      expect(res.status, r + '/').toBe(308);
      expect(res.headers.get('location')).toBe(r);
      expect(await (await fetch(base + r)).text()).toBe('app');
    }
    const seo = await fetch(base + '/la-bai/', { redirect: 'manual' });
    expect(seo.status).toBe(200);
    expect(await seo.text()).toBe('seo');
  });
});
