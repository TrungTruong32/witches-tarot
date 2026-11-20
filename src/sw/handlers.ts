// Logic của service worker (install / activate / fetch), nhận caches/fetch/self qua tham số để test được.
// Chỉ dùng kiểu có ở cả lib DOM lẫn WebWorker (Request, Response, CacheStorage) — sw.ts mới gắn vào sự kiện thật.
import { FONT_HOSTS, route } from './routes';

export interface SwDeps {
  caches: CacheStorage;
  fetch: typeof fetch;
  skipWaiting(): Promise<void>;
  claim(): Promise<void>;
  /** URL gốc để hiểu đường dẫn tương đối của danh sách precache (trong SW: self.location.href). */
  base: string;
}

export interface SwConfig {
  /** 'wtarot-app-<hash>': vỏ app + /assets/* + mọi thứ lưu lúc chạy (trang /la-bai/…, font, og-image). */
  appCache: string;
  /** 'wtarot-data-<hash>': tarot.db, card_en.json, sky.json, icon, mặt lưng — chỉ đổi khi dữ liệu đổi. */
  dataCache: string;
  /** '/', '/index.html', /assets/* (kể cả wasm sql.js). */
  appAssets: readonly string[];
  dataAssets: readonly string[];
}

/** Khoá cache của vỏ app: mọi route của app dùng chung một bản HTML. */
const SHELL_KEY = '/index.html';

export function createSw(deps: SwDeps, { appCache, dataCache, appAssets, dataAssets }: SwConfig) {
  const { caches } = deps;

  /** Tải một file vào cache. cache: 'reload' → bỏ qua HTTP cache của trình duyệt (không nhét bản tarot.db cũ vào
   *  cache mới). Bỏ response bị redirect (vd. host đổi /index.html → /): Chrome từ chối trả nó cho điều hướng. */
  async function store(c: Cache, u: string, reuse: readonly string[]) {
    // /assets/* bất biến theo tên (tên có hash nội dung) → có sẵn trong cache wtarot-* cũ thì chép sang, khỏi tải lại.
    if (u.startsWith('/assets/')) {
      for (const k of reuse) {
        const hit = await (await caches.open(k)).match(u);
        if (hit) return c.put(u, hit);
      }
    }
    const res = await deps.fetch(new Request(new URL(u, deps.base), { cache: 'reload' }));
    if (!res.ok || res.redirected) throw new Error(u + ' HTTP ' + res.status);
    await c.put(u, res);
  }

  async function install() {
    const reuse = (await caches.keys()).filter(k => k.startsWith('wtarot-') && k !== appCache && k !== dataCache);
    // Dữ liệu không đổi (cache data cùng tên đã có tarot.db) → khỏi tải lại tarot.db khi chỉ đổi code.
    const dataReady = (await caches.has(dataCache)) && !!(await (await caches.open(dataCache)).match('/tarot.db'));
    const app = await caches.open(appCache);
    const data = await caches.open(dataCache);
    // add từng cái, bỏ qua cái nào lỗi để không hỏng toàn bộ install.
    await Promise.all([
      ...appAssets.map(u => store(app, u, reuse).catch(() => {})),
      ...(dataReady ? [] : dataAssets.map(u => store(data, u, []).catch(() => {}))),
    ]);
    await deps.skipWaiting();
  }

  async function activate() {
    // Xoá mọi cache khác hai cache hiện tại — kể cả cache của SW cũ (wtarot-v9…), để bản cài đặt không kẹt bản cũ.
    const keep = new Set([appCache, dataCache]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    await deps.claim();
  }

  // Lưu lúc chạy luôn vào cache app (cache data chỉ do install ghi).
  async function put(key: RequestInfo, res: Response) {
    const c = await caches.open(appCache);
    await c.put(key, res).catch(() => {});
  }

  async function match(key: RequestInfo) {
    return (await (await caches.open(appCache)).match(key)) || (await (await caches.open(dataCache)).match(key));
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
  // Response opaque (no-cors) chỉ được lưu khi là font Google — opaque không biết có lỗi hay không.
  async function cacheFirst(req: Request): Promise<Response> {
    const hit = await match(req);
    if (hit) return hit;
    try {
      const net = await deps.fetch(req);
      if (net && (net.ok || (net.type === 'opaque' && FONT_HOSTS.has(new URL(req.url).hostname)))) void put(req, net.clone());
      return net;
    } catch {
      return Response.error();
    }
  }

  /** null = không can thiệp (để trình duyệt tự đi mạng): non-GET, /api/*. */
  function handle(req: Request): Promise<Response> | null {
    if (req.method !== 'GET') return null;
    const r = route(new URL(req.url), req.mode, new URL(deps.base).origin);
    if (r === 'bypass') return null;
    if (r === 'network-first-app') return navigate(req, true);
    if (r === 'network-first-page') return navigate(req, false);
    return cacheFirst(req);
  }

  return { install, activate, handle };
}
