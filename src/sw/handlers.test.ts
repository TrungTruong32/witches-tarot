// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSw, type SwDeps } from './handlers';

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

describe('service worker handlers', () => {
  it('install: thêm từng file, bỏ qua file lỗi, rồi skipWaiting', async () => {
    const env = fakeEnv([]);
    env.setFetch((async (r: RequestInfo) => {
      const u = typeof r === 'string' ? r : r.url;
      return u.endsWith('/missing.png') ? new Response('', { status: 404 }) : new Response('ok:' + u);
    }) as unknown as typeof fetch);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: ['/', '/index.html', '/tarot.db', '/missing.png'] });
    await sw.install();
    expect([...(env.map.get('wtarot-abc') as FakeCache).store.keys()].sort()).toEqual(['/', '/index.html', '/tarot.db']);
    expect(env.deps.skipWaiting).toHaveBeenCalled();
  });

  it('install: bỏ response bị redirect; offline app khi đó rơi về "/"', async () => {
    const env = fakeEnv([]);
    env.setFetch((async (r: RequestInfo) => {
      const res = new Response('ok:' + keyOf(r));
      if (keyOf(r) === '/index.html') Object.defineProperty(res, 'redirected', { value: true });
      return res;
    }) as unknown as typeof fetch);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: ['/', '/index.html'] });
    await sw.install();
    expect([...(env.map.get('wtarot-abc') as FakeCache).store.keys()]).toEqual(['/']);
    env.setFetch(offline);
    expect(await ((await sw.handle(nav('/nhat-ky'))) as Response).text()).toBe('ok:/');
  });

  it('activate: xoá wtarot-v9 và mọi cache khác, giữ cache hiện tại', async () => {
    const env = fakeEnv(['wtarot-v9', 'wtarot-old', 'wtarot-abc']);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: [] });
    await sw.activate();
    expect([...env.map.keys()]).toEqual(['wtarot-abc']);
    expect(env.deps.claim).toHaveBeenCalled();
  });

  it('offline: điều hướng /nhat-ky trả /index.html đã cache', async () => {
    const env = fakeEnv([]);
    await env.open('wtarot-abc').put('/index.html', new Response('<html>shell</html>'));
    env.setFetch(offline);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: [] });
    const res = await sw.handle(nav('/nhat-ky'));
    expect(await (res as Response).text()).toBe('<html>shell</html>');
  });

  it('online: điều hướng app được lưu dưới khoá /index.html', async () => {
    const env = fakeEnv([]);
    env.setFetch((async () => new Response('fresh')) as unknown as typeof fetch);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: [] });
    expect(await ((await sw.handle(nav('/tra-cuu'))) as Response).text()).toBe('fresh');
    await tick();
    const hit = await (env.map.get('wtarot-abc') as FakeCache).match('/index.html');
    expect(await (hit as Response).text()).toBe('fresh');
  });

  it('/la-bai/x: lưu theo URL riêng; offline trả bản của nó, chưa có thì /index.html', async () => {
    const env = fakeEnv([]);
    env.setFetch((async () => new Response('page-x')) as unknown as typeof fetch);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: [] });
    await sw.handle(nav('/la-bai/x/'));
    await tick();
    const c = env.map.get('wtarot-abc') as FakeCache;
    expect(c.store.has('/la-bai/x/')).toBe(true);
    expect(c.store.has('/index.html')).toBe(false); // trang lá bài không ghi đè vỏ app
    await c.put('/index.html', new Response('shell'));
    env.setFetch(offline);
    expect(await ((await sw.handle(nav('/la-bai/x/'))) as Response).text()).toBe('page-x');
    expect(await ((await sw.handle(nav('/la-bai/y/'))) as Response).text()).toBe('shell');
  });

  it('cache-first: có trong cache thì không gọi mạng; /api và non-GET thì bỏ qua (null)', async () => {
    const env = fakeEnv([]);
    await env.open('wtarot-abc').put('/tarot.db', new Response('db'));
    const f = vi.fn(async () => new Response('net'));
    env.setFetch(f as unknown as typeof fetch);
    const sw = createSw(env.deps, { cacheName: 'wtarot-abc', assets: [] });
    expect(await ((await sw.handle(new Request(BASE + '/tarot.db'))) as Response).text()).toBe('db');
    expect(f).not.toHaveBeenCalled();
    expect(sw.handle(new Request(BASE + '/api/ai'))).toBeNull();
    expect(sw.handle(new Request(BASE + '/x.png', { method: 'POST', body: 'a' }))).toBeNull();
  });
});
