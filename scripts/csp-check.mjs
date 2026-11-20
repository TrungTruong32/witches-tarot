// Kiểm tra CSP thật trên bản build: phục vụ dist/ với header + rewrite của vercel.json (serve-dist), rồi chạy
// smoke-flows với BASE đó — smoke gom mọi securitypolicyviolation và lỗi console, phải bằng 0.
// Trước đó: hash script inline trong dist/index.html phải nằm trong script-src (Vite giữ nguyên byte script).
// Chạy: npm run build && node scripts/csp-check.mjs
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFor, readVercelConfig, serveDist } from './serve-dist.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = join(REPO, 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Thiếu dist/index.html — chạy `npm run build` trước.');
  process.exit(1);
}
const config = readVercelConfig();
const csp = headersFor(config, '/')['Content-Security-Policy'] || '';
const inline = [...readFileSync(join(DIST, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
for (const s of inline) {
  const h = `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
  if (!csp.includes(h)) {
    console.error(`FAIL  script inline trong dist/index.html (${h}) không có trong CSP của vercel.json`);
    process.exit(1);
  }
}
console.log(`PASS  ${inline.length} script inline trong dist/index.html khớp hash trong script-src`);

const { server } = await serveDist(DIST, 0, config);
const base = 'http://127.0.0.1:' + server.address().port;
console.log('serve-dist: ' + base);
const child = spawn(process.execPath, [join(REPO, 'scripts', 'smoke-flows.mjs'), base], { stdio: 'inherit' });
const code = await new Promise(ok => child.on('exit', c => ok(c ?? 1)));
server.close();
process.exit(code);
