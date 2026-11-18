#!/usr/bin/env node
// Deploy bản đang commit (HEAD) lên Vercel Production, rồi tự kiểm tra trang + API lưu trải bài.
//   node scripts/deploy-prod.mjs
// Dùng VERCEL_TOKEN trong .env (không in ra). Từ chối deploy nếu còn thay đổi chưa commit.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SITE = 'https://tt-witches-tarot.vercel.app';
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const mask = t => [env.VERCEL_TOKEN].filter(Boolean).reduce((s, v) => s.split(v).join('***'), t);
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });

const dirty = sh('git', ['status', '--porcelain']).stdout.trim();
if (dirty) { console.error('✗ Còn thay đổi chưa commit — commit trước rồi deploy:\n' + dirty); process.exit(1); }
const head = sh('git', ['log', '-1', '--format=%h %s']).stdout.trim();
console.log(`… Deploy ${head} lên Production (vài chục giây)…`);

const auth = env.VERCEL_TOKEN ? ['--token', env.VERCEL_TOKEN] : [];
const r = sh('npx', ['-y', 'vercel@latest', 'deploy', '--prod', '--yes', '--scope', 'trung-truong', ...auth]);
const out = mask((r.stdout || '') + (r.stderr || ''));
if (r.status !== 0) { console.error('✗ Deploy lỗi:\n' + out.trim().split('\n').slice(-10).join('\n')); process.exit(1); }
console.log('✓ Deploy xong: ' + ((out.match(/https:\/\/\S+\.vercel\.app/g) || []).pop() || ''));

// Kiểm tra nhanh trên bản thật (không ghi gì vào DB: body rỗng → API phải trả 400)
const page = await (await fetch(SITE + '/witches_tarot.html', { cache: 'no-store' })).text();
console.log(page.includes('cloudSaveReading') ? '✓ Trang đã có tính năng lưu trải bài' : '✗ Trang CHƯA có tính năng lưu (có thể cache, thử lại sau 1 phút)');
const api = await fetch(SITE + '/api/readings', { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: '{}' });
const msg = { 400: '✓ API /api/readings chạy và đã đọc được khoá Supabase', 503: '✗ API chạy nhưng THIẾU biến SUPABASE_* trên Vercel', 404: '✗ API chưa có trên bản deploy', 403: '✗ API chặn origin — báo Claude kiểm tra' }[api.status];
console.log(msg || `? API trả về ${api.status}`);
