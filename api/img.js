// Edge image proxy: serves a remote card image from THIS origin so it can be
// drawn onto a <canvas> without tainting it (remote hosts like tarot.vn send no
// CORS header, which would otherwise block toBlob/toDataURL on export).
// Host allow-list keeps this from becoming an open proxy.
export const config = { runtime: 'edge' };

const ALLOW = new Set(['tarot.vn', 'www.tarot.vn']);

export default async function handler(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get('u');
  if (!target) return new Response('Missing u', { status: 400 });

  let u;
  try { u = new URL(target); } catch { return new Response('Bad url', { status: 400 }); }
  if (u.protocol !== 'https:' || !ALLOW.has(u.hostname)) {
    return new Response('Host not allowed', { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(u.toString(), { headers: { 'accept': 'image/*' } });
  } catch (e) {
    return new Response('Fetch failed: ' + e.message, { status: 502 });
  }
  const ct = upstream.headers.get('content-type') || 'image/jpeg';
  if (!ct.startsWith('image/')) return new Response('Not an image', { status: 415 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': ct,
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*'   // same-origin anyway, but explicit for canvas
    }
  });
}
