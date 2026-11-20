// Phần dùng chung của deploy-prod.mjs và deploy-preview.mjs: đọc .env, chạy npx vercel, đọc phiên bản bản build,
// kiểm tra bản deploy. Import file này KHÔNG có tác dụng phụ (không đọc .env, không chạy lệnh) — test gọi được các hàm thuần.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { APP_VERSION_RE, computeAppVersion } from './app-version.mjs';

export const SITE = 'https://tt-witches-tarot.vercel.app';
export const SCOPE = 'trung-truong';
/** Ghim phiên bản Vercel CLI: bản build/deploy không đổi theo bản CLI mới phát hành. Nâng thì sửa ở đây. */
export const VERCEL_CLI = 'vercel@66.5.0';

/** Đọc .env dạng KEY=value (không in ra). Không có file → {}. */
export function loadEnv(file = '.env') {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

/** Hàm che mọi bí mật (token) trong chuỗi output. */
export const makeMask = secrets => t => secrets.filter(Boolean).reduce((s, v) => s.split(v).join('***'), t);

export const git = args => spawnSync('git', args, { encoding: 'utf8' });                 // git là .exe → không cần shell
// npx trên Windows là .cmd → phải qua shell; truyền MỘT chuỗi lệnh (đối số đều là chữ cố định, không có dấu cách).
// Token KHÔNG nằm trên dòng lệnh (lộ qua danh sách tiến trình): truyền qua biến môi trường VERCEL_TOKEN của tiến trình con.
export const npx = (args, token) => spawnSync(['npx', ...args].join(' '), {
  encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024,
  env: token ? { ...process.env, VERCEL_TOKEN: token } : process.env,
});

/** Lý do token không dùng được, hoặc null. Không có token → null (dùng phiên đăng nhập của Vercel CLI). */
export function tokenError(token) {
  if (token == null || token === '') return null;
  return /^[A-Za-z0-9_-]+$/.test(token) ? null : '✗ VERCEL_TOKEN trong .env có ký tự lạ (chỉ cho phép A-Z a-z 0-9 _ -) — kiểm tra lại .env';
}

/**
 * Đối số cho `npx vercel <cmd>`. Không có --token: token đi qua biến môi trường (xem npx).
 * @param {string[]} cmd  vd. ['deploy', ...buildEnvArgs(v)]
 * @param {{ prod: boolean }} o
 */
export function vercelArgs(cmd, { prod }) {
  return ['-y', VERCEL_CLI, ...cmd, ...(prod ? ['--prod'] : []), '--yes', '--scope', SCOPE];
}

/** URL bản deploy trong output của `vercel deploy` (URL *.vercel.app cuối cùng; dòng Inspect là vercel.com nên bị bỏ). */
export function parseDeployUrl(out) {
  return (String(out).match(/https:\/\/[\w.-]+\.vercel\.app/g) || []).pop() || null;
}

/** Nội dung <meta name="app-version"> trong một trang HTML, hoặc null. */
export function readBuiltVersion(html) {
  const tag = (String(html).match(/<meta\b[^>]*\bname=["']app-version["'][^>]*>/i) || [])[0];
  if (!tag) return null;
  return (tag.match(/\bcontent=["']([^"']*)["']/i) || [])[1] ?? null;
}

/** Lý do không được deploy với phiên bản này, hoặc null nếu hợp lệ. */
export function versionError(v) {
  if (v == null) return '✗ Bản build không có thẻ <meta name="app-version">';
  if (v === 'dev') return "✗ app-version = 'dev' (không đọc được git lúc build) — không deploy bản không rõ phiên bản";
  if (v.includes('%APP_VERSION%')) return '✗ app-version chưa được thay (%APP_VERSION%) — bản build lỗi';
  return null;
}

/**
 * Kiểm tra nhanh một bản deploy (không ghi gì vào DB: body rỗng → API phải trả 400).
 * Preview có thể nằm sau Deployment Protection: 401/403 → báo "protected" (không kiểm tra được; previewExitCode → 2).
 * Preview chưa có biến môi trường của API: 503 ở /api/readings, /api/ai → cảnh báo (warn), không tính là hỏng; Prod thì hỏng.
 * @param {string} site  gốc bản deploy (SITE hoặc URL preview)
 * @param {string} expectedVersion  app-version của bản build ở máy
 * @param {(url: string, init?: RequestInit) => Promise<Response>} fetchFn
 * @param {{ preview?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, msg: string, protected?: boolean, warn?: boolean }[]>}
 */
export async function checkDeployment(site, expectedVersion, fetchFn, { preview = false } = {}) {
  const out = [];
  const get = (p, init = {}) => fetchFn(site + p, { cache: 'no-store', ...init });
  const post = p => fetchFn(site + p, { method: 'POST', headers: { origin: site, 'content-type': 'application/json' }, body: '{}' });
  /** Chạy một bước; 401/403 trên preview → protected */
  async function step(label, call, judge) {
    let r;
    try { r = await call(); } catch (e) { out.push({ ok: false, msg: `✗ ${label}: lỗi mạng ${e?.message || e}` }); return; }
    if (preview && (r.status === 401 || r.status === 403)) {
      out.push({ ok: true, protected: true, msg: `• ${label}: protected (${r.status}, Deployment Protection) — không kiểm tra được` });
      return;
    }
    out.push(await judge(r));
  }

  await step('/', () => get('/'), async r => {
    if (r.status !== 200) return { ok: false, msg: `✗ / trả về ${r.status}` };
    const v = readBuiltVersion(await r.text());
    if (v === 'dev') return { ok: false, msg: "✗ / có app-version = 'dev'" };
    if (v !== expectedVersion) return { ok: false, msg: `✗ / có app-version "${v}", mong đợi "${expectedVersion}" (có thể cache, thử lại sau 1 phút)` };
    return { ok: true, msg: `✓ / đúng app-version "${v}"` };
  });
  await step('/trai-bai', () => get('/trai-bai'), async r => {
    const body = r.status === 200 ? await r.text() : '';
    return r.status === 200 && /id=["']root["']/.test(body)
      ? { ok: true, msg: '✓ /trai-bai 200 + có app' }
      : { ok: false, msg: `✗ /trai-bai trả về ${r.status}${r.status === 200 ? ' nhưng không có <div id="root">' : ''}` };
  });
  await step('/trai-bai/', () => get('/trai-bai/', { redirect: 'manual' }), async r => {
    const loc = r.headers.get('location') || '';
    return r.status === 308 && /\/trai-bai$/.test(loc)
      ? { ok: true, msg: '✓ /trai-bai/ → 308 /trai-bai' }
      : { ok: false, msg: `✗ /trai-bai/ phải 308 → /trai-bai, nhận ${r.status} ${loc}` };
  });
  for (const p of ['/la-bai/', '/sitemap.xml', '/robots.txt', '/sw.js']) {
    await step(p, () => get(p), async r => (r.status === 200 ? { ok: true, msg: `✓ ${p} 200` } : { ok: false, msg: `✗ ${p} trả về ${r.status}` }));
  }
  /** Preview: 503 = API chạy nhưng project chưa có biến môi trường cho Preview → chỉ cảnh báo */
  const previewEnvWarn = (r, label) => (preview && r.status === 503
    ? { ok: true, warn: true, msg: `⚠ ${label} trả 503 — API env vars not set for Preview (biến môi trường của API chưa đặt cho Preview; Prod vẫn bắt buộc)` }
    : null);
  await step('/api/readings', () => post('/api/readings'), async r => {
    const w = previewEnvWarn(r, '/api/readings');
    if (w) return w;
    const m = { 400: '✓ API /api/readings chạy và đã đọc được khoá Supabase', 503: '✗ API /api/readings chạy nhưng THIẾU biến SUPABASE_* trên Vercel', 404: '✗ /api/readings chưa có trên bản deploy', 403: '✗ /api/readings chặn origin — báo Claude kiểm tra' }[r.status];
    return { ok: r.status === 400, msg: m || `✗ /api/readings trả về ${r.status}` };
  });
  // AI miễn phí: body rỗng → 400 nếu đã đủ key + Supabase (không tốn lượt), 503 nếu thiếu
  await step('/api/ai', () => post('/api/ai'), async r => {
    const w = previewEnvWarn(r, '/api/ai');
    if (w) return w;
    const m = { 400: '✓ API /api/ai (AI miễn phí) đã có key', 503: '✗ /api/ai THIẾU key AI (GEMINI/OLLAMA/OPENROUTER_API_KEY) hoặc biến Supabase', 404: '✗ /api/ai chưa có trên bản deploy' }[r.status];
    return { ok: r.status === 400, msg: m || `✗ /api/ai trả về ${r.status}` };
  });
  return out;
}

/**
 * `--build-env APP_VERSION="<hash> <giờ>"` cho `vercel deploy`: Vercel build trên máy chủ (không có .git), phiên bản
 * tính ở máy được truyền vào để thẻ meta khớp với bản vừa commit. Lệnh đi qua shell → chỉ nhận đúng dạng APP_VERSION_RE.
 * @param {string} version
 */
export function buildEnvArgs(version) {
  if (!APP_VERSION_RE.test(version)) throw new Error(`app-version không hợp lệ: ${JSON.stringify(version)}`);
  return ['--build-env', `"APP_VERSION=${version}"`];
}

/**
 * Mã thoát của deploy-preview sau checkDeployment: 1 = có bước hỏng; 2 = bị Deployment Protection, CHƯA kiểm chứng được gì;
 * 0 = kiểm tra được và ổn (có thể kèm cảnh báo) → chạy tiếp smoke.
 * @param {{ ok: boolean, protected?: boolean }[]} results
 */
export function previewExitCode(results) {
  if (results.some(r => !r.ok)) return 1;
  if (results.some(r => r.protected)) return 2;
  return 0;
}

/**
 * Toàn bộ quy trình deploy (tải lên, Vercel build). Trả về { url, version, results } hoặc thoát với mã 1 khi có bước lỗi.
 * @param {{ prod: boolean, argv: string[], branchError: (branch: string, argv: string[]) => string | null }} o
 */
export async function runDeploy({ prod, argv, branchError }) {
  const fail = m => { console.error(m); process.exit(1); };
  // Bỏ cảnh báo của Node ("(node:123) …Warning…") để dòng lỗi thật không bị đẩy ra khỏi phần đuôi được in
  const tail = (s, n) => s.split('\n').filter(l => !/^\(node:\d+\) /.test(l)).join('\n').trim().split('\n').slice(-n).join('\n');
  const env = loadEnv();
  const mask = makeMask([env.VERCEL_TOKEN]);
  const branchErr = branchError(git(['branch', '--show-current']).stdout.trim(), argv);
  if (branchErr) fail(branchErr);
  const dirty = git(['status', '--porcelain']).stdout.trim();
  if (dirty) fail('✗ Còn thay đổi chưa commit — commit trước rồi deploy:\n' + dirty);
  const head = git(['log', '-1', '--format=%h %s']).stdout.trim();
  const target = prod ? 'Production' : 'Preview';

  console.log('… npm run check');
  const chk = spawnSync('npm run check', { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (chk.status !== 0) fail('✗ npm run check lỗi:\n' + ((chk.stdout || '') + (chk.stderr || '')).trim().split('\n').slice(-20).join('\n'));

  const token = env.VERCEL_TOKEN;
  const tErr = tokenError(token);
  if (tErr) fail(tErr);
  // Vì sao không `vercel build` + `--prebuilt`: trên Windows (không bật Developer Mode) `vercel build` hỏng khi cài
  // builder (EPERM symlink). Nên tải thư mục làm việc lên (đã lọc bằng .vercelignore, có dữ liệu bài ở máy) và để
  // Vercel chạy `npm run build` — giống cách deploy của bản cũ; deploy vẫn chỉ đi từ máy này.
  const version = computeAppVersion();
  const vErr = versionError(version);
  if (vErr) fail(vErr);
  console.log(`… ${VERCEL_CLI} deploy lên ${target}, Vercel build ${version} (${head}) — vài phút…`);
  const d = npx(vercelArgs(['deploy', ...buildEnvArgs(version)], { prod }), token);
  const out = mask((d.stdout || '') + (d.stderr || ''));
  if (d.status !== 0) fail('✗ Deploy lỗi:\n' + tail(out, 40));
  const deployed = parseDeployUrl(d.stdout || '') || parseDeployUrl(out);
  console.log('✓ Deploy xong: ' + (deployed || '(không đọc được URL)'));
  const url = prod ? SITE : deployed;
  if (!url) fail('✗ Không đọc được URL bản preview từ output của vercel deploy');

  const results = await checkDeployment(url, version, fetch, { preview: !prod });
  for (const r of results) console.log(r.msg);
  return { url, version, results };
}
