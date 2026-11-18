// Proxy ảnh: lấy ảnh lá bài từ tarot.vn và trả về từ CHÍNH origin này để vẽ lên <canvas> khi xuất ảnh
// (tarot.vn không gửi header CORS nên canvas sẽ bị "taint"). Chỉ cho phép host tarot.vn (không thành open proxy).
// An toàn: chỉ nhận ảnh raster (chặn SVG — SVG có thể chứa script chạy trên origin này), không đi theo redirect,
// giới hạn kích thước. Chịu tải: CDN của Vercel giữ ảnh 30 ngày (s-maxage) nên ảnh lặp lại không chạy function.
import { json, clientIp, sameOrigin, limited } from './_guard.js';

const ALLOW = new Set(['tarot.vn', 'www.tarot.vn']);
const TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(req) {
  // Trang khác nhúng/gọi ảnh qua đây → chặn; mở thẳng URL hoặc client không phải trình duyệt vẫn được
  if (!sameOrigin(req, { allowDirect: true })) return new Response('Forbidden', { status: 403 });
  const ip = clientIp(req) || 'unknown';
  if (limited('img:ip:' + ip, 300, 60000) || limited('img:all', 1500, 10000)) return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });

  const target = new URL(req.url).searchParams.get('u');
  if (!target) return new Response('Missing u', { status: 400 });
  let u;
  try { u = new URL(target); } catch { return new Response('Bad url', { status: 400 }); }
  if (u.protocol !== 'https:' || !ALLOW.has(u.hostname) || u.port || u.username || u.password) {
    return new Response('Host not allowed', { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(u.toString(), { headers: { accept: 'image/*' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch {
    return new Response('Fetch failed', { status: 502 });
  }
  if (!upstream.ok) { try { await upstream.body?.cancel(); } catch {} return new Response('Upstream ' + upstream.status, { status: 502 }); }
  const ct = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.has(ct)) { try { await upstream.body?.cancel(); } catch {} return new Response('Not an allowed image', { status: 415 }); }
  if (Number(upstream.headers.get('content-length') || 0) > MAX_BYTES) { try { await upstream.body?.cancel(); } catch {} return new Response('Too large', { status: 413 }); }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return new Response('Too large', { status: 413 });
  return new Response(buf, {
    status: 200,
    headers: {
      'content-type': ct,
      'content-length': String(buf.byteLength),
      'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin'
    }
  });
}

export function POST() { return json(405, { error: 'method not allowed' }); }
