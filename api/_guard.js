// Hàng rào dùng chung cho các API. Tên bắt đầu bằng "_" nên Vercel KHÔNG biến file này thành một endpoint.
// Lớp chặn chính khi bị DDoS là Vercel Firewall (chạy trước function, không tính tiền request bị chặn —
// xem scripts/setup-firewall.mjs). Các giới hạn ở đây là lớp thứ hai, đếm trong RAM của từng instance:
// mục đích là từ chối thật nhanh, TRƯỚC khi gọi Supabase / nhà cung cấp AI, để database không bị dội theo.

export const json = (status, body, extra) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(extra || {}) }
});

// Trên Vercel, x-real-ip / x-forwarded-for do nền tảng tự đặt (client không giả được)
export function clientIp(req) {
  const ip = req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '';
  return ipNet(ip);
}
// IPv6: một thiết bị/hộ gia đình thường được cấp nguyên dải /64 → đổi địa chỉ trong dải không né được hạn mức
export function ipNet(ip) {
  if (!ip.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) return ip.replace(/^::ffff:/i, '');
  const [head, tail = ''] = ip.toLowerCase().split('%')[0].split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return full.slice(0, 4).map(x => (x || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// Request có đến từ chính trang này không.
// - Trình duyệt luôn gửi sec-fetch-site; khác "same-origin" là bị trang khác gọi → chặn.
// - POST luôn có Origin; GET cùng trang thì trình duyệt không gửi Origin nhưng có sec-fetch-site.
// - allowDirect: cho phép mở thẳng URL (sec-fetch-site "none") hoặc client không phải trình duyệt (dùng cho ảnh).
// Lưu ý: client tự viết (curl, script) giả được các header này — đây chỉ là hàng rào chống trang khác lợi dụng;
// chống spam bằng script là việc của rate limit + Firewall.
export function sameOrigin(req, { allowDirect = false } = {}) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && !(allowDirect && site === 'none')) return false;
  const origin = req.headers.get('origin');
  if (origin) { try { return new URL(origin).host === host; } catch { return false; } }
  if (site) return site === 'same-origin' || allowDirect;
  // Trình duyệt cũ (Safari < 16.4) không gửi sec-fetch-site: GET cùng trang thì dựa vào Referer
  const ref = req.headers.get('referer');
  if (ref) { try { return new URL(ref).host === host; } catch { return false; } }
  return allowDirect;
}

// Cửa sổ cố định trong RAM. Trả về true nếu VƯỢT giới hạn.
const buckets = new Map();
export function limited(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= b.win) { b = { start: now, win: windowMs, n: 0 }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 20000) {                         // bị dội bởi rất nhiều IP → dọn, không để tràn RAM
    for (const [k, v] of buckets) if (now - v.start >= v.win) buckets.delete(k);
    if (buckets.size > 20000) buckets.clear();
  }
  return b.n > max;
}

// Giới hạn số request chạy CÙNG LÚC trên một instance (vd. stream AI dài). Trả về hàm release, hoặc null nếu đầy.
const inflight = new Map();
export function acquire(name, max) {
  const n = inflight.get(name) || 0;
  if (n >= max) return null;
  inflight.set(name, n + 1);
  let done = false;
  return () => { if (!done) { done = true; inflight.set(name, Math.max(0, (inflight.get(name) || 1) - 1)); } };
}

// Đọc body nhưng dừng ngay khi vượt maxBytes (không nạp cả body khổng lồ vào RAM). null = quá lớn.
export async function readText(req, maxBytes) {
  const cl = Number(req.headers.get('content-length') || 0);
  if (cl > maxBytes) return null;
  if (!req.body) return '';
  const reader = req.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { try { await reader.cancel(); } catch {} return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(all);
}

// fetch có hạn giờ: Supabase / nhà cung cấp chậm thì bỏ, không giữ function treo (tốn tiền, dễ bị dồn khi bị tấn công)
export const fetchT = (url, init = {}, ms = 8000) => fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(ms) });

// Nhớ kết quả trong vài giây (vd. tổng số bản ghi) để không hỏi Supabase ở MỌI request
const memo = new Map();
export async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await fn();
  memo.set(key, { at: Date.now(), v });
  return v;
}
