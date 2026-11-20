// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSw, type SwConfig, type SwDeps } from './handlers';

const BASE = 'https://t.example';
const keyOf = (r: RequestInfo | URL) => new URL(typeof r === 'string' ? r : r instanceof URL ? r.href : r.url, BASE).pathname;

/** Cache giả trong bộ nhớ: khoá = pathname (đủ cho test cùng origin). */
class FakeCache {
  store = new Map<string, Response>();
  constructor(private net: () => typeof fetch) {}
  async add(r: RequestInfo) {
    const res = await this.net()(r);
    if (!res.ok) throw new TypeError('bad status');
    this.store.set(keyOf(r), res);
  }
  async put(r: RequestInfo, res: Response) {
    this.store.set(keyOf(r), res);
  }
  async match(r: RequestInfo) {
    return this.store.get(keyOf(r))?.clone();
  }
}

function fakeEnv(names: string[]) {
  const map = new Map<string, FakeCache>();
  let net: typeof fetch = (async () => new Response('net')) as unknown as typeof fetch;
  const open = (n: string) => {
    if (!map.has(n)) map.set(n, new FakeCache(() => net));
    return map.get(n) as FakeCache;
  };
  names.forEach(open);
  const caches = {
    open: async (n: string) => open(n),
    keys: async () => [...map.keys()],
    delete: async (n: string) => map.delete(n),
    has: async (n: string) => map.has(n),
  } as unknown as CacheStorage;
  const deps: SwDeps = {
    caches,
    fetch: ((...a: Parameters<typeof fetch>) => net(...a)) as typeof fetch,
    skipWaiting: vi.fn(async () => {}),
    claim: vi.fn(async () => {}),
    base: BASE + '/sw.js',
  };
  return { map, deps, open, setFetch: (f: typeof fetch) => { net = f; } };
}

// new Request(..., { mode: 'navigate' }) ném lỗi → dùng object thường có đủ url/method/mode.
const nav = (path: string) => ({ url: BASE + path, method: 'GET', mode: 'navigate' }) as unknown as Request;
const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
const tick = () => new Promise(r => setTimeout(r, 0));

const APP = 'wtarot-app-new';
const DATA = 'wtarot-data-new';
const cfg = (o: Partial<SwConfig> = {}): SwConfig => ({ appCache: APP, dataCache: DATA, appAssets: [], dataAssets: [], ...o });
const keys = (env: ReturnType<typeof fakeEnv>, name: string) => [...(env.map.get(name)?.store.keys() ?? [])].sort();
/** fetch giả trả 'ok:<path>' và ghi lại các path đã gọi. */
const counting = (env: ReturnType<typeof fakeEnv>, status: (path: string) => number = () => 200) => {
  const calls: string[] = [];
  env.setFetch((async (r: RequestInfo) => {
    calls.push(keyOf(r));
    return new Response('ok:' + keyOf(r), { status: status(keyOf(r)) });
  }) as unknown as typeof fetch);
  return calls;
};

describe('service worker handlers', () => {
  it('install: app vào cache app, data vào cache data; file phụ lỗi thì bỏ qua; rồi skipWaiting', async () => {
    const env = fakeEnv([]);
    counting(env, p => (p === '/missing.png' ? 404 : 200));
    const sw = createSw(env.deps, cfg({ appAssets: ['/', '/index.html', '/assets/a.js'], dataAssets: ['/tarot.db', '/missing.png'] }));
    await sw.install();
    expect(keys(env, APP)).toEqual(['/', '/assets/a.js', '/index.html']);
    expect(keys(env, DATA)).toEqual(['/tarot.db']);
    expect(env.deps.skipWaiting).toHaveBeenCalled();
  });

  it('install: cache data đã có (dữ liệu không đổi) → không tải lại tarot.db', async () => {
    const env = fakeEnv([]);
    await env.open(DATA).put('/tarot.db', new Response('db-cu'));
    const calls = counting(env);
    const sw = createSw(env.deps, cfg({ appAssets: ['/index.html'], dataAssets: ['/tarot.db', '/sky.json'] }));
    await sw.install();
    expect(calls).toEqual(['/index.html']);
    expect(await ((await env.map.get(DATA)?.match('/tarot.db')) as Response).text()).toBe('db-cu');
  });

  it('install: /assets/* đã có trong cache wtarot-* cũ thì chép sang, không đi mạng', async () => {
    const env = fakeEnv([]);
    await env.open('wtarot-app-old').put('/assets/same.js', new Response('cu'));
    const calls = counting(env);
    const sw = createSw(env.deps, cfg({ appAssets: ['/index.html', '/assets/same.js', '/assets/new.js'] }));
    await sw.install();
    expect(calls.sort()).toEqual(['/assets/new.js', '/index.html']);
    expect(await ((await env.map.get(APP)?.match('/assets/same.js')) as Response).text()).toBe('cu');
  });

  it('install: bỏ response bị redirect; offline app khi đó rơi về "/"', async () => {
    const env = fakeEnv([]);
    env.setFetch((async (r: RequestInfo) => {
      const res = new Response('ok:' + keyOf(r));
      if (keyOf(r) === '/index.html') Object.defineProperty(res, 'redirected', { value: true });
      return res;
    }) as unknown as typeof fetch);
    const sw = createSw(env.deps, cfg({ appAssets: ['/', '/index.html'] }));
    await sw.install();
    expect(keys(env, APP)).toEqual(['/']);
    env.setFetch(offline);
    expect(await ((await sw.handle(nav('/nhat-ky'))) as Response).text()).toBe('ok:/');
  });

  it('activate: giữ đúng cache app + data hiện tại, xoá mọi cache khác kể cả wtarot-v9', async () => {
    const env = fakeEnv(['wtarot-v9', 'wtarot-app-old', 'wtarot-data-old', APP, DATA]);
    const sw = createSw(env.deps, cfg());
    await sw.activate();
    expect([...env.map.keys()].sort()).toEqual([APP, DATA]);
    expect(env.deps.claim).toHaveBeenCalled();
  });

  it('offline: điều hướng /nhat-ky trả /index.html đã cache', async () => {
    const env = fakeEnv([]);
    await env.open(APP).put('/index.html', new Response('<html>shell</html>'));
    env.setFetch(offline);
    const sw = createSw(env.deps, cfg());
    const res = await sw.handle(nav('/nhat-ky'));
    expect(await (res as Response).text()).toBe('<html>shell</html>');
  });

  it('online: điều hướng app được lưu dưới khoá /index.html (cache app)', async () => {
    const env = fakeEnv([]);
    env.setFetch((async () => new Response('fresh')) as unknown as typeof fetch);
    const sw = createSw(env.deps, cfg());
    expect(await ((await sw.handle(nav('/tra-cuu'))) as Response).text()).toBe('fresh');
    await tick();
    const hit = await env.map.get(APP)?.match('/index.html');
    expect(await (hit as Response).text()).toBe('fresh');
  });

  it('/la-bai/x: lưu theo URL riêng; offline trả bản của nó, chưa có thì /index.html', async () => {
    const env = fakeEnv([]);
    env.setFetch((async () => new Response('page-x')) as unknown as typeof fetch);
    const sw = createSw(env.deps, cfg());
    await sw.handle(nav('/la-bai/x/'));
    await tick();
    const c = env.map.get(APP) as FakeCache;
    expect(c.store.has('/la-bai/x/')).toBe(true);
    expect(c.store.has('/index.html')).toBe(false); // trang lá bài không ghi đè vỏ app
    await c.put('/index.html', new Response('shell'));
    env.setFetch(offline);
    expect(await ((await sw.handle(nav('/la-bai/x/'))) as Response).text()).toBe('page-x');
    expect(await ((await sw.handle(nav('/la-bai/y/'))) as Response).text()).toBe('shell');
  });

  it('opaque chỉ được cache cho font Google', async () => {
    const env = fakeEnv([]);
    const opaque = () => {
      const r = new Response(null);
      Object.defineProperty(r, 'type', { value: 'opaque' });
      Object.defineProperty(r, 'ok', { value: false });
      return r;
    };
    env.setFetch((async () => opaque()) as unknown as typeof fetch);
    const sw = createSw(env.deps, cfg());
    await sw.handle(new Request('https://fonts.gstatic.com/s/a.woff2'));
    await sw.handle(new Request(BASE + '/odd.png'));
    await tick();
    expect(keys(env, APP)).toEqual(['/s/a.woff2']);
  });

  it('cache-first: tìm cả hai cache, có thì không gọi mạng; /api và non-GET thì bỏ qua (null)', async () => {
    const env = fakeEnv([]);
    await env.open(DATA).put('/tarot.db', new Response('db'));
    await env.open(APP).put('/assets/a.js', new Response('js'));
    const f = vi.fn(async () => new Response('net'));
    env.setFetch(f as unknown as typeof fetch);
    const sw = createSw(env.deps, cfg());
    expect(await ((await sw.handle(new Request(BASE + '/tarot.db'))) as Response).text()).toBe('db');
    expect(await ((await sw.handle(new Request(BASE + '/assets/a.js'))) as Response).text()).toBe('js');
    expect(f).not.toHaveBeenCalled();
    expect(sw.handle(new Request(BASE + '/api/ai'))).toBeNull();
    expect(sw.handle(new Request(BASE + '/x.png', { method: 'POST', body: 'a' }))).toBeNull();
  });

  it('cache-first: tải từ mạng thì lưu vào cache app', async () => {
    const env = fakeEnv([]);
    counting(env);
    const sw = createSw(env.deps, cfg());
    await sw.handle(new Request(BASE + '/og-image.jpg'));
    await tick();
    expect(keys(env, APP)).toEqual(['/og-image.jpg']);
    expect(env.map.get(DATA)?.store.size ?? 0).toBe(0);
  });
});
