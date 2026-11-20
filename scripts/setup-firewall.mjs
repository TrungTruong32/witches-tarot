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
// Dùng VERCEL_TOKEN trong .env (không in ra). Luật đã có (cùng tên) thì được cập nhật — chạy lại KHÔNG kèm --enforce sẽ đưa nó về chỉ ghi log.
// Khi đang bị tấn công dữ dội: vào dashboard Vercel → Firewall → bật "Attack Challenge Mode".
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tokenError, VERCEL_CLI } from './deploy-lib.mjs';

const env = {};
if (fs.existsSync('.env')) for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').split(/\s+#/)[0].trim();
}
const token = process.env.VERCEL_TOKEN || env.VERCEL_TOKEN;
if (tokenError(token)) { console.error(tokenError(token)); process.exit(1); }
const mask = t => (token ? String(t).split(token).join('***') : String(t));
const ENFORCE = process.argv.includes('--enforce');
const ACTION = ENFORCE ? 'rate_limit' : 'log';

// Gọi Vercel CLI qua node + npx-cli.js (không qua shell → JSON trong đối số không bị vỡ dấu ngoặc kép trên Windows)
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
// token qua biến môi trường VERCEL_TOKEN của tiến trình con, không đặt trên dòng lệnh
const childEnv = token ? { ...process.env, VERCEL_TOKEN: token } : process.env;
function vercel(args) {
  const all = ['-y', VERCEL_CLI, ...args, '--scope', 'trung-truong'];
  const r = fs.existsSync(npxCli)
    ? spawnSync(process.execPath, [npxCli, ...all], { encoding: 'utf8', env: childEnv })
    : spawnSync('npx ' + all.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' '), { encoding: 'utf8', shell: true, env: childEnv });
  return { ok: r.status === 0, out: mask((r.stdout || '') + (r.stderr || '')).trim() };
}

if (process.argv.includes('--inspect')) {           // xem cấu hình thật của luật đang chạy trên Production
  for (const args of [['firewall', 'rules', 'inspect', 'RL api', '--json'], ['firewall', 'overview']]) {
    const r = vercel(args);
    console.log(`— vercel ${args.join(' ')} —\n` + r.out.replace(/(<|&lt;)claude-code-hint.*?(>|&gt;)/g, '').trim() + '\n');
  }
  process.exit(0);
}

if (process.argv.includes('--publish')) {
  // Vercel bắt NGƯỜI xác nhận việc publish (--yes không đủ): lần đầu script in ra thay đổi + mã xác nhận,
  // bạn xem rồi chạy lại kèm --confirm <mã> — đó chính là bước bạn đồng ý.
  const i = process.argv.indexOf('--confirm'), digest = i > 0 ? process.argv[i + 1] : '';
  const r = vercel(['firewall', 'publish', ...(digest ? ['--confirm-name', 'tarot', '--effects-digest', digest] : ['--yes'])]);
  if (r.ok) { console.log('✓ Đã áp dụng luật Firewall lên Production'); process.exit(0); }
  const clean = r.out.replace(/(<|&lt;)claude-code-hint.*?(>|&gt;)/g, '').trim();
  let j = null;
  try { const s = clean.indexOf('{'); j = JSON.parse(clean.slice(s, clean.indexOf('\n}', s) + 2)); } catch {}
  if (j && j.reason === 'confirmation_required' && j.data?.effectsDigest) {
    console.log('Vercel cần bạn xác nhận trước khi áp dụng:');
    for (const e of j.data.effects || []) console.log('  • ' + e);
    const changes = clean.slice(clean.lastIndexOf('Changes to be published')).trim();
    if (changes.startsWith('Changes')) console.log('\n' + changes);
    console.log(`\nĐồng ý thì chạy:  node scripts/setup-firewall.mjs --publish --confirm ${j.data.effectsDigest}`);
    process.exit(0);
  }
  console.error('✗ Publish lỗi:\n' + clean.split('\n').slice(-40).join('\n'));
  process.exit(1);
}

// Giới hạn đặt rộng tay (gấp nhiều lần người dùng thật) — chỉ chặn script / bot dội request.
// Đếm theo IP, cửa sổ 60 giây. Vượt → 429. Lưu ý: bộ đếm tính riêng theo từng region của Vercel.
// Gói Hobby chỉ cho MỘT luật rate limit → gộp mọi đường dễ bị dội vào một luật (các nhóm điều kiện nối bằng OR):
//   /api/* (AI, lưu trải bài, proxy LLM, proxy ảnh — proxy ảnh chỉ dùng khi xuất ảnh, ≤ 15 ảnh/lần)
//   /tarot.db (2MB, trình duyệt tải 1 lần rồi cache) — chống đốt băng thông
const RULES = [
  { name: 'RL api', desc: '/api/* và /tarot.db: 120 / phút / IP',
    groups: [[{ type: 'path', op: 'pre', value: '/api/' }], [{ type: 'path', op: 'eq', value: '/tarot.db' }]], requests: 120 }
];
const condArgs = groups => groups.flatMap((g, i) => [...(i ? ['--or'] : []), ...g.flatMap(c => ['--condition', JSON.stringify(c)])]);
// Lỗi của CLI: ưu tiên các dòng có chữ error / limit / plan, không thì lấy vài dòng cuối
const why = out => { const l = out.split('\n').filter(x => /error|limit|plan|upgrade|exceed|maximum|not allowed/i.test(x) && !/Rate Limit:|If exceeded/i.test(x)); return (l.length ? l : out.split('\n').slice(-6)).slice(0, 6).join('\n   '); };

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
  const mode = ENFORCE ? 'CHẶN' : 'chỉ ghi log';
  // Luật đã có (kể cả bản nháp) → sửa cho đúng điều kiện + giới hạn hiện tại; chưa có → tạo mới
  let res = vercel(['firewall', 'rules', 'edit', r.name, '--description', r.desc, ...condArgs(r.groups), '--action', 'rate_limit', ...limit]);
  let what = 'cập nhật, ' + mode;
  if (!res.ok && !existing.includes(r.name)) {
    res = vercel(['firewall', 'rules', 'add', r.name, '--description', r.desc, ...condArgs(r.groups), '--action', 'rate_limit', ...limit]);
    what = 'tạo, ' + mode;
  }
  if (res.ok) { changed++; console.log(`✓ Nháp (${what}): "${r.name}" — ${r.desc}`); }
  else console.error(`✗ "${r.name}" lỗi:\n   ` + why(res.out));
}

const diff = vercel(['firewall', 'diff']);
console.log('\n— Thay đổi đang chờ áp dụng —\n' + diff.out.split('\n').slice(-40).join('\n'));
console.log(changed ? '\n→ Xem lại ở trên rồi chạy:  node scripts/setup-firewall.mjs --publish' : '\n(không có luật mới)');
