#!/usr/bin/env node
// Cài Supabase cho Witches Tarot bằng SUPABASE_ACCESS_TOKEN trong file .env (tài khoản cá nhân).
//   node scripts/setup-supabase.mjs              → liệt kê tổ chức (nếu có nhiều) / tạo project / tạo bảng
//   node scripts/setup-supabase.mjs <org-id>     → chọn tổ chức cụ thể
// KHÔNG in bất kỳ khoá/mật khẩu nào. Kết quả nhạy cảm được GHI vào .env (đã nằm trong .gitignore & .vercelignore):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF
import fs from 'node:fs';
import crypto from 'node:crypto';

const ENV = '.env', NAME = 'witches-tarot', REGION = 'ap-southeast-1';
const MIGRATION = 'supabase/migrations/20261117090000_readings.sql';
const API = 'https://api.supabase.com/v1';

function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV)) return out;
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
function writeEnv(updates) {
  let text = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp('^' + k + '=.*$', 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : text.replace(/\s*$/, '') + `\n${k}=${v}\n`;
  }
  fs.writeFileSync(ENV, text);
}

const env = readEnv();
const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('✗ Không thấy SUPABASE_ACCESS_TOKEN trong .env'); process.exit(1); }
const H = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  // 1) Tổ chức
  const orgs = await api('GET', '/organizations');
  console.log('Tổ chức của tài khoản này:');
  orgs.forEach(o => console.log(`  - ${o.name}  (id: ${o.id})`));
  let orgId = process.argv[2];
  if (!orgId) {
    if (orgs.length !== 1) { console.log('\n→ Có nhiều tổ chức. Chạy lại kèm id, ví dụ:  node scripts/setup-supabase.mjs ' + (orgs[0]?.id || '<org-id>')); process.exit(0); }
    orgId = orgs[0].id;
  }
  if (!orgs.some(o => o.id === orgId)) throw new Error('org-id không thuộc tài khoản này: ' + orgId);

  // 2) Project: dùng lại nếu đã có, không thì tạo mới
  const projects = await api('GET', '/projects');
  let proj = projects.find(p => p.name === NAME && p.organization_id === orgId);
  if (proj) console.log(`\n✓ Đã có project "${NAME}" (${proj.id}) — dùng lại.`);
  else {
    const dbPass = crypto.randomBytes(24).toString('base64url');
    console.log(`\n… Tạo project "${NAME}" ở ${REGION} (gói hiện tại của tổ chức; Free cho tối đa 2 project miễn phí)…`);
    proj = await api('POST', '/projects', { name: NAME, organization_id: orgId, region: REGION, db_pass: dbPass });
    writeEnv({ SUPABASE_DB_PASSWORD: dbPass });
    console.log(`✓ Đã tạo project ${proj.id}. Mật khẩu DB đã ghi vào .env (SUPABASE_DB_PASSWORD).`);
  }
  const ref = proj.id || proj.ref;

  // 3) Đợi project sẵn sàng
  process.stdout.write('… Đợi project khởi động');
  for (let i = 0; i < 90; i++) {
    const p = await api('GET', '/projects/' + ref);
    if (p.status === 'ACTIVE_HEALTHY') break;
    process.stdout.write('.'); await sleep(10000);
    if (i === 89) throw new Error('Project chưa sẵn sàng sau 15 phút, chạy lại script sau.');
  }
  console.log(' sẵn sàng.');

  // 4) Tạo bảng (migration chạy lại an toàn: create if not exists)
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  for (let i = 0; ; i++) {
    try { await api('POST', `/projects/${ref}/database/query`, { query: sql }); break; }
    catch (e) { if (i >= 5) throw e; await sleep(8000); }
  }
  const check = await api('POST', `/projects/${ref}/database/query`, { query: "select relrowsecurity as rls from pg_class where oid = 'public.readings'::regclass" });
  console.log(`✓ Bảng public.readings đã sẵn sàng (RLS: ${check?.[0]?.rls ? 'bật' : 'TẮT ⚠'}).`);

  // 5) Lấy service role key → ghi vào .env (không in)
  const keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
  const svc = keys.find(k => k.name === 'service_role') || keys.find(k => k.type === 'secret');
  if (!svc || !svc.api_key) throw new Error('Không lấy được service role key');
  const url = `https://${ref}.supabase.co`;
  writeEnv({ SUPABASE_PROJECT_REF: ref, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: svc.api_key });
  console.log(`✓ Đã ghi SUPABASE_URL (${url}) và SUPABASE_SERVICE_ROLE_KEY vào .env (không in ra).`);
  console.log('\nXONG. Bước còn lại: đặt 2 biến SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trên Vercel (Production) rồi deploy.');
} catch (e) {
  console.error('\n✗ Lỗi: ' + e.message);
  process.exit(1);
}
