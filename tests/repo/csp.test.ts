// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { headersFor, type VercelConfig } from '../../scripts/serve-dist.mjs';

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
const csp = headersFor(config, '/')['Content-Security-Policy'] ?? '';
const directive = (name: string) => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) ?? '').split(/\s+/).slice(1);

/** Mọi <script> inline (không có src), trừ JSON-LD (type="application/ld+json" — dữ liệu, không chạy). */
const inlineScripts = (html: string) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\bsrc\s*=/i.test(m[1] ?? '') && !/\btype\s*=\s*["']?application\/ld\+json/i.test(m[1] ?? ''))
    .map(m => m[2] ?? '');
const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

describe('CSP không có script inline tuỳ tiện', () => {
  const scripts = inlineScripts(readFileSync('index.html', 'utf8'));

  it('index.html có đúng một script inline (theme bootstrap) và hash của nó nằm trong script-src', () => {
    expect(scripts).toHaveLength(1);
    expect(directive('script-src')).toContain(sha256(scripts[0]!));
  });

  it("script-src: chỉ 'self', 'wasm-unsafe-eval' và hash — không 'unsafe-inline', không CDN", () => {
    const src = directive('script-src');
    expect(src).not.toContain("'unsafe-inline'");
    expect(src.join(' ')).not.toMatch(/cdnjs|https?:/);
    expect(src).toEqual(["'self'", "'wasm-unsafe-eval'", sha256(scripts[0]!)]);
  });

  it.skipIf(!existsSync('dist/index.html'))('bản build giữ nguyên byte script inline → cùng hash (bỏ qua khi chưa build)', () => {
    expect(inlineScripts(readFileSync('dist/index.html', 'utf8'))).toEqual(scripts);
  });

  it('bộ lọc script inline: bắt cả <script type="module"> inline, bỏ src và JSON-LD', () => {
    const html = '<script>a</script><script type="module">b</script><script src="/x.js"></script><script type="application/ld+json">{}</script>';
    expect(inlineScripts(html)).toEqual(['a', 'b']);
  });

  it('Permissions-Policy cho phép geolocation của chính site (bản đồ sao dùng GPS)', () => {
    const pp = headersFor(config, '/bau-troi')['Permissions-Policy'] ?? '';
    expect(pp.split(/,\s*/)).toContain('geolocation=(self)');
    for (const off of ['camera=()', 'microphone=()', 'payment=()', 'usb=()']) expect(pp).toContain(off);
  });
});
