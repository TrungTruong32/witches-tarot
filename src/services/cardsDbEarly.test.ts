import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCardsDbDownload, startCardsDbDownload } from './cardsDb';

afterEach(() => {
  resetCardsDbDownload();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('link[rel="preload"]').forEach(l => l.remove());
});

describe('startCardsDbDownload (tải sớm DB trên route của app)', () => {
  it('fetch tarot.db đúng một lần và preload wasm dạng as=fetch + crossorigin (khớp fetch của sql.js)', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('x')));
    vi.stubGlobal('fetch', fetchMock);
    startCardsDbDownload();
    startCardsDbDownload(); // lần hai không tải lại
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/tarot.db');
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"]');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('as')).toBe('fetch');
    expect(links[0]!.getAttribute('crossorigin')).toBe('anonymous');
    expect(links[0]!.getAttribute('href')).toMatch(/sql-wasm.*\.wasm/);
  });

  it('lỗi mạng lúc tải sớm không thành "unhandled rejection"', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    startCardsDbDownload();
    await new Promise(r => setTimeout(r, 20));
    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});

describe('earlyDb (import đầu tiên của main.tsx)', () => {
  const run = async (path: string) => {
    window.history.replaceState(null, '', path);
    vi.resetModules();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('x')));
    vi.stubGlobal('fetch', fetchMock);
    await import('../app/earlyDb');
    (await import('./cardsDb')).resetCardsDbDownload();
    return fetchMock;
  };
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('trang mở đầu "/" không tải gì (DB vẫn hoãn tới sau lần vẽ đầu)', async () => {
    expect(await run('/')).not.toHaveBeenCalled();
    expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
  });

  it('route của app và link chia sẻ "/#r=" bắt đầu tải tarot.db ngay', async () => {
    expect(await run('/hom-nay')).toHaveBeenCalledWith('/tarot.db');
    expect(await run('/#r=abc')).toHaveBeenCalledWith('/tarot.db');
  });
});
