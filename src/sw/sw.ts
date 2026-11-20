// Service worker cho Witches Tarot — cho phép cài đặt & chạy offline phần lõi.
// Sinh lúc build (scripts/build-sw.mjs → dist/sw.js): danh sách precache và phiên bản được nhúng vào hằng số bên dưới.
// Hai cache tên theo nội dung (wtarot-app-<hash>, wtarot-data-<hash>) — đổi code hay dữ liệu là tự đổi tên cache
// (không còn quy tắc "nhớ bump CACHE" như sw.js cũ). Xem scripts/build-sw.mjs.
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
  { appCache: __SW_APP_CACHE__, dataCache: __SW_DATA_CACHE__, appAssets: __SW_APP_ASSETS__, dataAssets: __SW_DATA_ASSETS__ },
);

self.addEventListener('install', e => e.waitUntil(sw.install()));
self.addEventListener('activate', e => e.waitUntil(sw.activate()));
self.addEventListener('fetch', e => {
  const res = sw.handle(e.request);
  if (res) e.respondWith(res);
});
