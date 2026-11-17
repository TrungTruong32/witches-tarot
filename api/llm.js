// Edge proxy: browser calls same-origin /api/llm (no CORS), we forward to the
// LLM provider server-side. Streaming (SSE) is passed through untouched.
// The target URL is provided by the client via the x-target-url header and is
// restricted to an allow-list to avoid an open proxy / SSRF.
export const config = { runtime: 'edge' };

const ALLOW = new Set(['zenmux.ai', 'www.zenmux.ai', 'platform.beeknoee.com', 'ollama.com', 'www.ollama.com']);

export default async function handler(req) {
  const target = req.headers.get('x-target-url');
  if (!target) return new Response('Missing x-target-url', { status: 400 });

  let u;
  try { u = new URL(target); } catch { return new Response('Bad target url', { status: 400 }); }
  if (u.protocol !== 'https:' || !ALLOW.has(u.hostname)) {
    return new Response('Target host not allowed', { status: 403 });
  }

  const headers = {};
  const auth = req.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  const ct = req.headers.get('content-type');
  if (ct) headers['content-type'] = ct;

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: 'Proxy fetch failed: ' + e.message } }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }

  // Pass status + body (streamed) + content-type straight back to the browser.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' }
  });
}
