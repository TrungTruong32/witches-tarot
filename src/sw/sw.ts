// Service worker cho Witches Tarot — cho phép cài đặt & chạy offline phần lõi.
// Sinh lúc build (scripts/build-sw.mjs → dist/sw.js): danh sách precache và phiên bản được nhúng vào hằng số bên dưới.
// Phiên bản = hash nội dung mọi file precache, nên đổi tarot.db/icon/cardback/bản build là tự đổi tên cache
// (không còn quy tắc "nhớ bump CACHE" như sw.js cũ).
import { createSw } from './handlers';

declare const self: ServiceWorkerGlobalScope;

const sw = createSw(
  {
    caches,
    fetch: (...a) => fetch(...a),
    skipWaiting: () => self.skipWaiting(),
    claim: () => self.clients.claim(),
    base: self.location.href,
  },
  { cacheName: 'wtarot-' + __SW_VERSION__, assets: __SW_ASSETS__ },
);

self.addEventListener('install', e => e.waitUntil(sw.install()));
self.addEventListener('activate', e => e.waitUntil(sw.activate()));
self.addEventListener('fetch', e => {
  const res = sw.handle(e.request);
  if (res) e.respondWith(res);
});
