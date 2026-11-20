#!/usr/bin/env node
// Đẩy SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (bắt buộc) + key/model AI miễn phí (nếu có) từ .env lên Vercel (môi trường Production) cho project đã link ở .vercel/.
//   node scripts/push-vercel-env.mjs [--scope <team>]
// Nếu .env có VERCEL_TOKEN thì dùng token đó (không in ra); không thì dùng phiên `vercel login` của máy.
// Giá trị được truyền qua stdin cho Vercel CLI — KHÔNG in ra màn hình. Cần Vercel CLI đã đăng nhập (npx vercel login).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tokenError, VERCEL_CLI } from './deploy-lib.mjs';

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
// AI miễn phí (/api/ai): biến nào có trong .env thì đẩy, thiếu thì bỏ qua
const OPTIONAL = ['GEMINI_API_KEY', 'OLLAMA_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_MODELS', 'GEMINI_MODEL', 'OLLAMA_MODEL', 'OPENROUTER_MODEL', 'AI_DEVICE_DAILY', 'AI_IP_DAILY', 'AI_GLOBAL_DAILY', 'AI_HASH_SECRET', 'READINGS_DAILY_MAX', 'READINGS_MAX_MB', 'READINGS_MAX_ROWS', 'BACKFILL_UNTIL', 'BACKFILL_TOTAL_MAX'];
const TARGET = 'production';
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, '').trim().replace(/^['"]|['"]$/g, '');   // bỏ "# chú thích" cuối dòng
}
const NAMES = REQUIRED.concat(OPTIONAL.filter(n => env[n]));
const pass = process.argv.slice(2);                         // vd: --scope my-team
if (!pass.includes('--scope')) pass.push('--scope', 'trung-truong');   // team đang chứa project "tarot"
const tErr = tokenError(env.VERCEL_TOKEN);
if (tErr) { console.error(tErr); process.exit(1); }
// token qua biến môi trường VERCEL_TOKEN của tiến trình con, không đặt trên dòng lệnh
const childEnv = env.VERCEL_TOKEN ? { ...process.env, VERCEL_TOKEN: env.VERCEL_TOKEN } : process.env;
const run = (args, input) => spawnSync('npx', ['-y', VERCEL_CLI, ...args, ...pass], { input, encoding: 'utf8', shell: process.platform === 'win32', env: childEnv });
const mask = t => [env.VERCEL_TOKEN, ...NAMES.map(n => env[n])].filter(Boolean).reduce((s, v) => s.split(v).join('***'), t);
let failed = false;
for (const name of NAMES) {
  const value = env[name];
  if (!value) { console.error(`✗ Thiếu ${name} trong .env — chạy scripts/setup-supabase.mjs trước.`); failed = true; continue; }
  run(['env', 'rm', name, TARGET, '--yes']);                                   // xoá giá trị cũ nếu có (lỗi thì bỏ qua)
  const extra = name.endsWith('_KEY') ? ['--sensitive'] : [];
  let r = run(['env', 'add', name, TARGET, ...extra], value);
  if (r.status !== 0 && extra.length) r = run(['env', 'add', name, TARGET], value);   // CLI cũ không có --sensitive
  const log = mask((r.stdout || '') + (r.stderr || ''));  // phòng hờ: không bao giờ in giá trị/token
  if (r.status === 0) console.log(`✓ Đã đặt ${name} cho ${TARGET}`);
  else { failed = true; console.error(`✗ Không đặt được ${name}:\n` + log.trim().split('\n').slice(-6).join('\n')); }
}
const aiKeys = OPTIONAL.filter(n => n.endsWith('_API_KEY') && env[n]);
console.log(aiKeys.length ? `ℹ Key AI miễn phí đã đẩy: ${aiKeys.join(', ')}` : 'ℹ .env chưa có GEMINI_API_KEY / OLLAMA_API_KEY / OPENROUTER_API_KEY → /api/ai sẽ báo chưa cấu hình.');
if (!failed) console.log('\nXONG. Deploy lại để các API dùng được các biến mới.');
process.exit(failed ? 1 : 0);
