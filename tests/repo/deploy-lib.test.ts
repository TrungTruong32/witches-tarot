// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeAppVersion } from '../../scripts/app-version.mjs';
import { buildEnvArgs, checkDeployment, makeMask, parseDeployUrl, previewExitCode, readBuiltVersion, SCOPE, SITE, tokenError, VERCEL_CLI, vercelArgs, versionError } from '../../scripts/deploy-lib.mjs';
import { deployBranchError, deployBranchErrorFor } from '../../scripts/deploy-guard.mjs';

const VER = 'abc1234 2026-11-20T10:00Z';
const html = (v: string) => `<!doctype html><html><head><meta charset="utf-8" />\n  <meta name="app-version" content="${v}" /></head><body><div id="root"></div></body></html>`;

describe('readBuiltVersion / versionError', () => {
  it('đọc thẻ meta app-version của bản build', () => {
    expect(readBuiltVersion(html(VER))).toBe(VER);
    expect(readBuiltVersion('<meta content="x y" name="app-version">')).toBe('x y');
  });
  it('không có thẻ → null', () => {
    expect(readBuiltVersion('<html></html>')).toBeNull();
  });
  it("từ chối 'dev', placeholder chưa thay và thiếu thẻ", () => {
    expect(versionError(VER)).toBeNull();
    expect(versionError('dev')).toMatch(/dev/);
    expect(versionError('%APP_VERSION%')).toMatch(/APP_VERSION/);
    expect(versionError(null)).toMatch(/app-version/);
  });
});

describe('vercelArgs', () => {
  it('deploy đúng đích (prod/preview), luôn có scope + --yes', () => {
    for (const prod of [true, false]) {
      const d = vercelArgs(['deploy', ...buildEnvArgs('abc1234 2026-11-20T10:00Z')], { prod });
      for (const a of [d]) {
        expect(a.slice(0, 2)).toEqual(['-y', VERCEL_CLI]);
        expect(a.includes('--prod')).toBe(prod);
        expect(a.join(' ')).toContain(`--scope ${SCOPE}`);
        expect(a).toContain('--yes');
        expect(a).not.toContain('--token'); // token đi qua biến môi trường, không lên dòng lệnh
      }
      expect(d.slice(2, 5)).toEqual(['deploy', '--build-env', '"APP_VERSION=abc1234 2026-11-20T10:00Z"']);
    }
    expect(SCOPE).toBe('trung-truong');
    expect(SITE).toBe('https://tt-witches-tarot.vercel.app');
  });
  it('ghim một phiên bản Vercel CLI cụ thể (không @latest)', () => {
    expect(VERCEL_CLI).toMatch(/^vercel@\d+\.\d+\.\d+$/);
  });
  it('tokenError: chỉ nhận [A-Za-z0-9_-]+, không có token thì cho qua', () => {
    expect(tokenError('abcXYZ_09-z')).toBeNull();
    expect(tokenError(undefined)).toBeNull();
    expect(tokenError('')).toBeNull();
    for (const bad of ['a b', 'a;rm', 'a&b', 'tok"', 'x\ny', '$(id)']) expect(tokenError(bad), bad).toMatch(/VERCEL_TOKEN/);
  });
});

describe('parseDeployUrl / makeMask', () => {
  it('lấy URL *.vercel.app cuối, bỏ dòng Inspect', () => {
    const out = 'Vercel CLI 50.0.0\nInspect: https://vercel.com/trung-truong/tt-witches-tarot/AbC123 [2s]\nPreview: https://tt-witches-tarot-abc123-trung-truong.vercel.app [3s]\nhttps://tt-witches-tarot-abc123-trung-truong.vercel.app\n';
    expect(parseDeployUrl(out)).toBe('https://tt-witches-tarot-abc123-trung-truong.vercel.app');
    expect(parseDeployUrl('Error: no')).toBeNull();
  });
  it('che token trong output', () => {
    expect(makeMask(['s3cret', undefined])('a s3cret b s3cret')).toBe('a *** b ***');
  });
});

type Resp = { status: number; body?: string; location?: string };
/** fetch giả: map "METHOD path" → phản hồi; ghi lại tuỳ chọn redirect của từng lần gọi */
function fakeFetch(routes: Record<string, Resp>, calls: { url: string; init?: RequestInit }[] = []) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const r = routes[`${init?.method || 'GET'} ${path}`] ?? { status: 404 };
    return new Response(r.body ?? '', { status: r.status, headers: r.location ? { location: r.location } : {} });
  };
}
const healthy = (site: string): Record<string, Resp> => ({
  'GET /': { status: 200, body: html(VER) },
  'GET /trai-bai': { status: 200, body: html(VER) },
  'GET /trai-bai/': { status: 308, location: site + '/trai-bai' },
  'GET /la-bai/': { status: 200, body: '<h1>la bai</h1>' },
  'GET /sitemap.xml': { status: 200 },
  'GET /robots.txt': { status: 200 },
  'GET /sw.js': { status: 200 },
  'POST /api/readings': { status: 400 },
  'POST /api/ai': { status: 400 },
});

describe('checkDeployment', () => {
  const site = 'https://example-preview.vercel.app';
  it('bản khoẻ: mọi bước ok, redirect gọi với redirect:manual, API gửi origin của chính bản deploy', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const res = await checkDeployment(site, VER, fakeFetch(healthy(site), calls));
    expect(res.filter(r => !r.ok)).toEqual([]);
    expect(res.length).toBeGreaterThanOrEqual(9);
    const redir = calls.find(c => c.url === site + '/trai-bai/');
    expect(redir?.init?.redirect).toBe('manual');
    const api = calls.find(c => c.url === site + '/api/ai');
    expect(new Headers(api?.init?.headers).get('origin')).toBe(site);
    expect(api?.init?.body).toBe('{}');
  });
  it('sai phiên bản / bản dev → hỏng bước /', async () => {
    const r1 = await checkDeployment(site, VER, fakeFetch({ ...healthy(site), 'GET /': { status: 200, body: html('old 2026-01-01T00:00Z') } }));
    expect(r1.find(r => !r.ok)?.msg).toMatch(/app-version/);
    const r2 = await checkDeployment(site, 'dev', fakeFetch({ ...healthy(site), 'GET /': { status: 200, body: html('dev') } }));
    expect(r2.find(r => !r.ok)?.msg).toMatch(/dev/);
  });
  it('/trai-bai thiếu #root, redirect sai, 404, API 503 → báo lỗi từng bước', async () => {
    const res = await checkDeployment(site, VER, fakeFetch({
      ...healthy(site),
      'GET /trai-bai': { status: 200, body: '<html>other</html>' },
      'GET /trai-bai/': { status: 200 },
      'GET /la-bai/': { status: 404 },
      'POST /api/ai': { status: 503 },
    }));
    const bad = res.filter(r => !r.ok).map(r => r.msg).join('\n');
    expect(bad).toMatch(/\/trai-bai\b/);
    expect(bad).toMatch(/308/);
    expect(bad).toMatch(/la-bai/);
    expect(bad).toMatch(/api\/ai/);
    expect(res.filter(r => !r.ok)).toHaveLength(4);
  });
  it('preview bị Deployment Protection (401/403) → "protected", không tính là hỏng', async () => {
    const all401 = Object.fromEntries(Object.keys(healthy(site)).map(k => [k, { status: 401 }]));
    const res = await checkDeployment(site, VER, fakeFetch(all401), { preview: true });
    expect(res.every(r => r.ok && r.protected)).toBe(true);
    expect(res[0]?.msg).toMatch(/protected/);
  });
  it('preview bị protected → previewExitCode 2 (UNVERIFIED), không phải 0', async () => {
    const all401 = Object.fromEntries(Object.keys(healthy(site)).map(k => [k, { status: 401 }]));
    expect(previewExitCode(await checkDeployment(site, VER, fakeFetch(all401), { preview: true }))).toBe(2);
    expect(previewExitCode(await checkDeployment(site, VER, fakeFetch(healthy(site)), { preview: true }))).toBe(0);
    expect(previewExitCode([{ ok: false, msg: 'x' }, { ok: true, protected: true, msg: 'y' }])).toBe(1);
  });
  it('preview: /api/* 503 → cảnh báo (API env vars not set for Preview), không hỏng; prod: 503 vẫn hỏng', async () => {
    const down = { 'POST /api/readings': { status: 503 }, 'POST /api/ai': { status: 503 } };
    const pv = await checkDeployment(site, VER, fakeFetch({ ...healthy(site), ...down }), { preview: true });
    expect(pv.filter(r => !r.ok)).toEqual([]);
    const warns = pv.filter(r => r.warn);
    expect(warns).toHaveLength(2);
    for (const w of warns) expect(w.msg).toMatch(/API env vars not set for Preview/);
    expect(previewExitCode(pv)).toBe(0);
    const prod = await checkDeployment(SITE, VER, fakeFetch({ ...healthy(SITE), ...down }));
    expect(prod.filter(r => !r.ok)).toHaveLength(2);
    expect(prod.some(r => r.warn)).toBe(false);
  });
  it('prod: 401 là lỗi thật', async () => {
    const res = await checkDeployment(SITE, VER, fakeFetch({ ...healthy(SITE), 'GET /': { status: 401 } }));
    expect(res[0]?.ok).toBe(false);
  });
});

describe('branch rule per script', () => {
  it('prod chỉ từ main (giữ deployBranchError), preview từ nhánh nào cũng được', () => {
    expect(deployBranchErrorFor('prod', 'react-migration', [])).toBe(deployBranchError('react-migration', []));
    expect(deployBranchErrorFor('prod', 'main', [])).toBeNull();
    expect(deployBranchErrorFor('preview', 'react-migration', [])).toBeNull();
    expect(deployBranchErrorFor('preview', '', [])).toBeNull();
  });
});

describe('computeAppVersion', () => {
  const now = new Date('2026-11-20T10:00:30Z');
  it('git chạy ở gốc repo, không theo thư mục hiện tại', () => {
    expect(computeAppVersion(now)).toMatch(/^[0-9a-f]{7,} 2026-11-20T10:00Z$/);
  });
  it("ngoài repo git → 'dev'", () => {
    const dir = mkdtempSync(join(tmpdir(), 'tarot-nogit-'));
    try { expect(computeAppVersion(now, dir)).toBe('dev'); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('phiên bản cho build trên máy chủ Vercel', () => {
  it('buildEnvArgs chỉ nhận đúng dạng "<hash> <giờ>" và bọc trong ngoặc kép cho shell', () => {
    expect(buildEnvArgs('abc1234 2026-11-20T10:00Z')).toEqual(['--build-env', '"APP_VERSION=abc1234 2026-11-20T10:00Z"']);
    for (const bad of ['dev', 'abc1234 2026-11-20T10:00Z" & calc', '', 'abc1234']) expect(() => buildEnvArgs(bad)).toThrow();
  });
  it('computeAppVersion dùng APP_VERSION hợp lệ từ môi trường (máy chủ không có .git), bỏ qua giá trị lạ', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nogit-'));
    try {
      expect(computeAppVersion(new Date(), dir, { APP_VERSION: 'abc1234 2026-11-20T10:00Z' })).toBe('abc1234 2026-11-20T10:00Z');
      expect(computeAppVersion(new Date(), dir, { APP_VERSION: 'evil; rm' })).toBe('dev');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
