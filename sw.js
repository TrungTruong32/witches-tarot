// Service worker cho Witches Tarot — cho phép cài đặt & chạy offline phần lõi.
// QUAN TRỌNG: bump 'v1'→'v2'… mỗi khi ĐỔI asset cache-first (tarot.db, icon, cardback),
// nếu không người dùng đã cài sẽ kẹt bản cũ mãi. Đổi riêng HTML thì KHÔNG cần bump
// (HTML dùng network-first).
const CACHE = 'wtarot-v9';

// Vỏ ứng dụng: HTML, DB, icon, mặt lưng bài.
const SHELL = [
  '/', '/tarot.db', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/icon-maskable.png', '/apple-touch-icon.png', '/cardback.png', '/cardback-witches.webp'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // add từng cái, bỏ qua cái nào lỗi để không hỏng toàn bộ install
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API (LLM/ảnh proxy) luôn đi mạng, không cache.
  if (url.pathname.startsWith('/api/')) return;

  // Điều hướng trang: network-first, offline thì trả HTML đã cache.
  // Chỉ trang chủ '/' được lưu làm vỏ app; các trang tĩnh /la-bai/… lưu theo đúng URL của nó
  // (trước đây mọi trang đều ghi đè key '/', mở trang lá bài sẽ làm hỏng bản offline của app).
  // /witches_tarot.html giờ redirect 301 về '/', nên không cache nó nữa.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const isApp = url.pathname === '/';
      try {
        const net = await fetch(req);
        if (net.ok && !net.redirected) {
          const c = await caches.open(CACHE); c.put(isApp ? '/' : req, net.clone()).catch(() => {});
        }
        return net;
      } catch {
        return (isApp ? null : await caches.match(req)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Còn lại: cache-first, có thì trả ngay, không thì tải mạng rồi cache lại
  // (kể cả sql.js/wasm từ CDN — response opaque vẫn cache được để dùng offline).
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net && (net.ok || net.type === 'opaque')) {
        const c = await caches.open(CACHE); c.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch {
      return hit || Response.error();
    }
  })());
});
