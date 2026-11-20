// Quyết định cách service worker xử lý một yêu cầu — hàm thuần, không đụng tới cache/mạng (dễ test).
import { PATH_BY_MODE } from '../app/modes';

/** Các đường dẫn của app (SPA): offline thì đều trả vỏ app /index.html. */
export const APP_ROUTES: readonly string[] = ['/', '/index.html', ...Object.values(PATH_BY_MODE)];

export type SwRoute = 'network-first-app' | 'network-first-page' | 'cache-first' | 'bypass';

/** `mode` = Request.mode ('navigate' khi người dùng mở trang). Yêu cầu không phải GET do sw.ts tự bỏ qua trước. */
export function route(url: URL, mode: string): SwRoute {
  // API (LLM/ảnh proxy) luôn đi mạng, không cache.
  if (url.pathname.startsWith('/api/')) return 'bypass';
  if (mode === 'navigate') {
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    // Chỉ route của app được lưu làm vỏ app; các trang tĩnh /la-bai/… lưu theo đúng URL của nó.
    return APP_ROUTES.includes(path) ? 'network-first-app' : 'network-first-page';
  }
  return 'cache-first';
}
