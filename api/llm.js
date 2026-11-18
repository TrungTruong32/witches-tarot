// Proxy cùng-origin: trình duyệt gọi /api/llm (không bị CORS), server chuyển tiếp tới nhà cung cấp LLM.
// Stream (SSE) được chuyển nguyên. URL đích do client gửi qua header x-target-url nhưng CHỈ được nằm trong
// danh sách cho phép (chống open proxy / SSRF). Key là của chính người dùng (header Authorization), server không lưu.
// Hàng rào: chỉ nhận từ chính trang này, không đi theo redirect, giới hạn kích thước + tần suất + thời gian.
import { json, clientIp, sameOrigin, limited, readText } from './_guard.js';

const ALLOW = new Set(['zenmux.ai', 'www.zenmux.ai', 'platform.beeknoee.com', 'ollama.com', 'www.ollama.com']);

async function handle(req) {
  if (!sameOrigin(req)) return json(403, { error: { message: 'forbidden' } });
  const ip = clientIp(req) || 'unknown';
  if (limited('llm:ip:' + ip, 60, 60000) || limited('llm:all', 300, 10000)) return json(429, { error: { message: 'rate limited' } }, { 'retry-after': '60' });

  const target = req.headers.get('x-target-url');
  if (!target) return json(400, { error: { message: 'Missing x-target-url' } });
  let u;
  try { u = new URL(target); } catch { return json(400, { error: { message: 'Bad target url' } }); }
  if (u.protocol !== 'https:' || !ALLOW.has(u.hostname) || u.port || u.username || u.password) {
    return json(403, { error: { message: 'Target host not allowed' } });
  }

  const headers = {};
  const auth = req.headers.get('authorization');
  if (auth) headers['authorization'] = auth.slice(0, 2000);
  const ct = req.headers.get('content-type');
  if (ct) headers['content-type'] = ct.slice(0, 200);

  const init = { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(280000) };
  if (req.method === 'POST') {
    const body = await readText(req, 1_000_000);
    if (body == null) return json(413, { error: { message: 'too large' } });
    init.body = body;
  }

  let upstream;
  try {
    upstream = await fetch(u.toString(), init);
  } catch (e) {
    return json(502, { error: { message: 'Proxy fetch failed' } });
  }
  // Không đi theo redirect: đích chuyển hướng có thể nằm ngoài danh sách cho phép
  if (upstream.status >= 300 && upstream.status < 400) return json(502, { error: { message: 'Upstream redirect not allowed' } });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export const GET = handle;
export const POST = handle;
