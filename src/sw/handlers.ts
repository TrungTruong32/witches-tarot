// Logic của service worker (install / activate / fetch), nhận caches/fetch/self qua tham số để test được.
// Chỉ dùng kiểu có ở cả lib DOM lẫn WebWorker (Request, Response, CacheStorage) — sw.ts mới gắn vào sự kiện thật.
import { route } from './routes';

export interface SwDeps {
  caches: CacheStorage;
  fetch: typeof fetch;
  skipWaiting(): Promise<void>;
  claim(): Promise<void>;
  /** URL gốc để hiểu đường dẫn tương đối của danh sách precache (trong SW: self.location.href). */
  base: string;
}

export interface SwConfig {
  /** 'wtarot-' + hash nội dung mọi file precache — đổi file nào là đổi tên cache, không cần bump tay như bản cũ. */
  cacheName: string;
  /** Vỏ ứng dụng: '/', '/index.html', /assets/* (kể cả wasm sql.js), tarot.db, card_en.json, sky.json, manifest, icon, mặt lưng bài. */
  assets: readonly string[];
}

/** Khoá cache của vỏ app: mọi route của app dùng chung một bản HTML. */
const SHELL_KEY = '/index.html';

export function createSw(deps: SwDeps, { cacheName, assets }: SwConfig) {
  const { caches } = deps;

  async function install() {
    const c = await caches.open(cacheName);
    // add từng cái, bỏ qua cái nào lỗi để không hỏng toàn bộ install.
    // cache: 'reload' → bỏ qua HTTP cache của trình duyệt, không nhét bản tarot.db cũ vào cache mới.
    // Bỏ response bị redirect (vd. host đổi /index.html → /): Chrome từ chối trả nó cho điều hướng.
    const one = async (u: string) => {
      const res = await deps.fetch(new Request(new URL(u, deps.base), { cache: 'reload' }));
      if (res.ok && !res.redirected) await c.put(u, res);
    };
    await Promise.all(assets.map(u => one(u).catch(() => {})));
    await deps.skipWaiting();
  }

  async function activate() {
    // Xoá mọi cache khác bản hiện tại — kể cả cache của SW cũ (wtarot-v9…), để bản cài đặt không kẹt bản cũ.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== cacheName).map(k => caches.delete(k)));
    await deps.claim();
  }

  async function put(key: RequestInfo, res: Response) {
    const c = await caches.open(cacheName);
    await c.put(key, res).catch(() => {});
  }

  async function match(key: RequestInfo) {
    return (await caches.open(cacheName)).match(key);
  }

  // Điều hướng trang: network-first, offline thì trả HTML đã cache.
  // Route của app lưu dưới khoá '/index.html'; trang khác (/la-bai/…) lưu theo đúng URL của nó
  // (để mở trang lá bài không ghi đè bản offline của app).
  async function navigate(req: Request, isApp: boolean): Promise<Response> {
    try {
      const net = await deps.fetch(req);
      if (net.ok && !net.redirected) void put(isApp ? SHELL_KEY : req.url, net.clone());
      return net;
    } catch {
      return (isApp ? undefined : await match(req.url)) || (await match(SHELL_KEY)) || (await match('/')) || Response.error();
    }
  }

  // Còn lại: cache-first, có thì trả ngay, không thì tải mạng rồi cache lại
  // (cả response opaque từ host khác, vd. font — vẫn cache được để dùng offline).
  async function cacheFirst(req: Request): Promise<Response> {
    const hit = await match(req);
    if (hit) return hit;
    try {
      const net = await deps.fetch(req);
      if (net && (net.ok || net.type === 'opaque')) void put(req, net.clone());
      return net;
    } catch {
      return Response.error();
    }
  }

  /** null = không can thiệp (để trình duyệt tự đi mạng): non-GET, /api/*. */
  function handle(req: Request): Promise<Response> | null {
    if (req.method !== 'GET') return null;
    const r = route(new URL(req.url), req.mode);
    if (r === 'bypass') return null;
    if (r === 'network-first-app') return navigate(req, true);
    if (r === 'network-first-page') return navigate(req, false);
    return cacheFirst(req);
  }

  return { install, activate, handle };
}
