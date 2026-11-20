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

/** Precache bắt buộc: thiếu một cái là app không chạy được offline (JS/CSS/wasm sql.js trong /assets, tarot.db).
 *  '/index.html' được kiểm riêng (chấp nhận '/' thay thế). */
const REQUIRED = (u: string) => u.startsWith('/assets/') || u === '/tarot.db';

export function createSw(deps: SwDeps, { appCache, dataCache, appAssets, dataAssets }: SwConfig) {
  const { caches } = deps;
  const origin = new URL(deps.base).origin;
  const DATA_PATHS = new Set(dataAssets);
  /** File dữ liệu (cùng origin, có trong danh sách data) → chỉ sống ở cache data. */
  const isData = (key: RequestInfo) => {
    const u = new URL(typeof key === 'string' ? key : key.url, deps.base);
    return u.origin === origin && DATA_PATHS.has(u.pathname);
  };

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
    const hadApp = await caches.has(appCache);
    const hadData = await caches.has(dataCache);
    const app = await caches.open(appCache);
    const data = await caches.open(dataCache);
    // Bỏ qua mục đã có sẵn trong cache cùng tên (cùng nội dung theo tên cache):
    //  - data: dữ liệu không đổi → khỏi tải lại tarot.db khi chỉ đổi code; mục phụ lần trước lỗi (còn thiếu) thì thử lại;
    //  - app: deploy chỉ đổi dữ liệu → /assets/* đã có trong cache app hiện tại thì khỏi tải lại.
    //    Vỏ '/', '/index.html' vẫn tải lại (nhẹ, và có thể đã được cập nhật lúc chạy).
    const missing = async (c: Cache, had: boolean, list: readonly string[], skippable: (u: string) => boolean) => {
      if (!had) return list;
      const present = await Promise.all(list.map(async u => skippable(u) && !!(await c.match(u))));
      return list.filter((_, i) => !present[i]);
    };
    const appTodo = await missing(app, hadApp, appAssets, u => u.startsWith('/assets/'));
    const dataTodo = await missing(data, hadData, dataAssets, () => true);
    // Phần bắt buộc lỗi → ném lỗi, install thất bại: SW cũ + cache cũ ở lại, lần sau trình duyệt thử lại.
    // Phần phụ (icon, mặt lưng, card_en/sky.json, '/') lỗi thì bỏ qua để không hỏng toàn bộ install, như bản cũ.
    const one = (c: Cache, u: string, from: readonly string[]) =>
      store(c, u, from).catch(e => {
        if (REQUIRED(u)) throw e;
      });
    try {
      await Promise.all([
        ...appTodo.map(u => one(app, u, reuse)),
        ...dataTodo.map(u => one(data, u, [])),
      ]);
      // Vỏ app: cần ít nhất một trong '/index.html' / '/' (host có thể redirect /index.html → /).
      if (!(await app.match(SHELL_KEY)) && !(await app.match('/'))) throw new Error('Không tải được vỏ app');
    } catch (e) {
      // Dọn cache mới dở dang (nếu do lần này tạo) để lần cài sau không tưởng dữ liệu đã đủ.
      if (!hadApp) await caches.delete(appCache);
      if (!hadData) await caches.delete(dataCache);
      throw e;
    }
    await deps.skipWaiting();
  }

  async function activate() {
    // Xoá mọi cache khác hai cache hiện tại — kể cả cache của SW cũ (wtarot-v9…), để bản cài đặt không kẹt bản cũ.
    const keep = new Set([appCache, dataCache]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    await deps.claim();
  }

  // Lưu lúc chạy: file dữ liệu vào cache data, còn lại vào cache app.
  async function put(key: RequestInfo, res: Response) {
    const c = await caches.open(isData(key) ? dataCache : appCache);
    await c.put(key, res).catch(() => {});
  }

  // File dữ liệu: tìm cache data trước — bản cũ lỡ nằm trong cache app không được che bản đúng ở cache data.
  async function match(key: RequestInfo) {
    const order = isData(key) ? [dataCache, appCache] : [appCache, dataCache];
    for (const name of order) {
      const hit = await (await caches.open(name)).match(key);
      if (hit) return hit;
    }
    return undefined;
  }

  // Điều hướng trang: network-first, offline (hoặc máy chủ 5xx) thì trả HTML đã cache.
  // Route của app lưu dưới khoá '/index.html'; trang khác (/la-bai/…) lưu theo đúng URL của nó
  // (để mở trang lá bài không ghi đè bản offline của app).
  async function navigate(req: Request, isApp: boolean): Promise<Response> {
    const cached = async () => (isApp ? undefined : await match(req.url)) || (await match(SHELL_KEY)) || (await match('/'));
    try {
      const net = await deps.fetch(req);
      if (net.ok && !net.redirected) void put(isApp ? SHELL_KEY : req.url, net.clone());
      // Máy chủ lỗi (5xx) → dùng bản đã cache nếu có, còn hơn trang lỗi.
      if (net.status >= 500) return (await cached()) || net;
      return net;
    } catch {
      return (await cached()) || Response.error();
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
    const r = route(new URL(req.url), req.mode, origin);
    if (r === 'bypass') return null;
    if (r === 'network-first-app') return navigate(req, true);
    if (r === 'network-first-page') return navigate(req, false);
    return cacheFirst(req);
  }

  return { install, activate, handle };
}
