#!/usr/bin/env node
// Cài rate limit cho Vercel Firewall — lớp chặn ĐẦU TIÊN khi bị DDoS / spam:
// chạy ở biên mạng của Vercel, trước function, request bị chặn KHÔNG tính tiền và không chạm tới Supabase / AI.
// (Chống DDoS tầng mạng L3/L4/L7 thì Vercel đã tự bật sẵn cho mọi project.)
//
//   node scripts/setup-firewall.mjs            → tạo bản NHÁP các luật ở chế độ CHỈ GHI LOG (chưa chặn ai) + in khác biệt
//   node scripts/setup-firewall.mjs --enforce  → chuyển (hoặc tạo) các luật sang CHẶN THẬT (trả 429 khi vượt)
//   node scripts/setup-firewall.mjs --publish  → áp dụng bản nháp lên Production (bước nào cũng cần publish)
// Cách dùng an toàn: chạy mặc định → --publish → xem Firewall dashboard 1–2 ngày → --enforce → --publish.
// Đang bị tấn công thật thì làm thẳng: --enforce → --publish.
//
// Dùng VERCEL_TOKEN trong .env (không in ra). Luật nào đã có (cùng tên) thì bỏ qua.
// Khi đang bị tấn công dữ dội: vào dashboard Vercel → Firewall → bật "Attack Challenge Mode".
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const env = {};
if (fs.existsSync('.env')) for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').split(/\s+#/)[0].trim();
}
const token = process.env.VERCEL_TOKEN || env.VERCEL_TOKEN;
const mask = t => (token ? String(t).split(token).join('***') : String(t));
const ENFORCE = process.argv.includes('--enforce');
const ACTION = ENFORCE ? 'rate_limit' : 'log';

// Gọi Vercel CLI qua node + npx-cli.js (không qua shell → JSON trong đối số không bị vỡ dấu ngoặc kép trên Windows)
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
function vercel(args) {
  const all = ['-y', 'vercel@latest', ...args, '--scope', 'trung-truong', ...(token ? ['--token', token] : [])];
  const r = fs.existsSync(npxCli)
    ? spawnSync(process.execPath, [npxCli, ...all], { encoding: 'utf8' })
    : spawnSync('npx ' + all.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' '), { encoding: 'utf8', shell: true });
  return { ok: r.status === 0, out: mask((r.stdout || '') + (r.stderr || '')).trim() };
}

if (process.argv.includes('--publish')) {
  const r = vercel(['firewall', 'publish', '--yes']);
  console.log(r.ok ? '✓ Đã áp dụng luật Firewall lên Production' : '✗ Publish lỗi:\n' + r.out.split('\n').slice(-8).join('\n'));
  process.exit(r.ok ? 0 : 1);
}

// Giới hạn đặt rộng tay (gấp nhiều lần người dùng thật) — chỉ chặn script / bot dội request.
// Đếm theo IP, cửa sổ 60 giây. Vượt → 429. Lưu ý: bộ đếm tính riêng theo từng region của Vercel.
const RULES = [
  { name: 'RL api', desc: 'API (AI, lưu trải bài, proxy LLM): 120 / phút / IP',
    cond: [{ type: 'path', op: 'pre', value: '/api/' }, { type: 'path', op: 'pre', value: '/api/img', neg: true }], requests: 120 },
  { name: 'RL api-img', desc: 'Proxy ảnh lá bài: 600 / phút / IP (trang Duyệt bài tải nhiều ảnh một lúc)',
    cond: [{ type: 'path', op: 'pre', value: '/api/img' }], requests: 600 },
  { name: 'RL tarot-db', desc: 'File dữ liệu tarot.db (2MB, trình duyệt chỉ tải 1 lần rồi cache): 20 / phút / IP — chống đốt băng thông',
    cond: [{ type: 'path', op: 'eq', value: '/tarot.db' }], requests: 20 }
];

const list = vercel(['firewall', 'rules', 'list', '--json']);
if (!list.ok) { console.error('✗ Không đọc được danh sách luật Firewall:\n' + list.out.split('\n').slice(-8).join('\n')); process.exit(1); }
let existing = [];
try {
  const start = Math.min(...['{', '['].map(c => list.out.indexOf(c)).filter(i => i >= 0));
  const j = JSON.parse(list.out.slice(start));
  existing = (Array.isArray(j) ? j : j.rules || j.data || []).map(r => r.name);
} catch {}

let changed = 0;
for (const r of RULES) {
  const limit = ['--rate-limit-window', '60', '--rate-limit-requests', String(r.requests), '--rate-limit-keys', 'ip', '--rate-limit-action', ACTION, '--yes'];
  let res, what;
  if (existing.includes(r.name)) {
    if (!ENFORCE) { console.log(`• "${r.name}" đã có — bỏ qua (dùng --enforce để chuyển sang chặn thật)`); continue; }
    res = vercel(['firewall', 'rules', 'edit', r.name, ...limit]); what = 'chuyển sang CHẶN';
  } else {
    const args = ['firewall', 'rules', 'add', r.name, '--description', r.desc];
    for (const c of r.cond) args.push('--condition', JSON.stringify(c));
    res = vercel([...args, '--action', 'rate_limit', ...limit]); what = ENFORCE ? 'tạo, CHẶN' : 'tạo, chỉ ghi log';
  }
  if (res.ok) { changed++; console.log(`✓ Nháp (${what}): "${r.name}" — ${r.desc}`); }
  else console.error(`✗ "${r.name}" lỗi (gói Hobby có thể giới hạn số luật):\n   ` + res.out.split('\n').slice(-4).join('\n   '));
}

const diff = vercel(['firewall', 'diff']);
console.log('\n— Thay đổi đang chờ áp dụng —\n' + diff.out.split('\n').slice(-40).join('\n'));
console.log(changed ? '\n→ Xem lại ở trên rồi chạy:  node scripts/setup-firewall.mjs --publish' : '\n(không có luật mới)');
