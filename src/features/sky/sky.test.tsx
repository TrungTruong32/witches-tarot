import { act, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkyData } from '../../services/skyData';

const loadSky = vi.fn<() => Promise<SkyData>>();
vi.mock('../../services/skyData', () => ({ loadSky: () => loadSky() }));
// bọc engine thật để theo dõi setLocation
const engines = vi.hoisted(() => [] as { setLocation: ReturnType<typeof vi.fn> }[]);
vi.mock('../../engines/skyMap', async importOriginal => {
  const m = await importOriginal<typeof import('../../engines/skyMap')>();
  return {
    ...m,
    startSkyMap: (...a: Parameters<typeof m.startSkyMap>) => {
      const e = m.startSkyMap(...a);
      const spy = vi.fn(e.setLocation);
      engines.push({ setLocation: spy });
      return { ...e, setLocation: spy };
    },
  };
});

import { initialState, useApp } from '../../app/store';
import { resetSkyGpsForTests, Sky } from './Sky';

const legacyHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');
const legacyPanel = new DOMParser().parseFromString(legacyHtml, 'text/html').querySelector('#skyView > .panel')!;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const INFO = (name: string) => 'Sao & chòm sao thật trên bầu trời ' + name + ' ngay lúc này. Thiên đỉnh ở giữa, chân trời ở mép. Kéo để xoay, lăn/chụm để phóng to.';
const SKY: SkyData = { stars: [], lines: [], names: [], consts: [] };

let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
const geo = { getCurrentPosition: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  resetSkyGpsForTests();
  engines.length = 0;
  useApp.setState({ ...initialState() });
  pending = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { const id = nextId++; pending.set(id, cb); return id; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => void pending.delete(id));
  loadSky.mockReset();
  loadSky.mockResolvedValue(SKY);
  geo.getCurrentPosition.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as unknown as { geolocation?: unknown }).geolocation;
});

const renderSky = async () => {
  const r = render(<div id="skyView"><Sky /></div>);
  await act(async () => {});
  return r;
};

describe('Sky markup', () => {
  it('ids, classes, texts and attributes in order match legacy', async () => {
    await renderSky();
    const ours = document.querySelector('#skyView > .panel')!;
    const sig = (root: Element) => [...root.querySelectorAll('*')].map(e =>
      [e.tagName, e.id, [...e.classList].sort().join('.'), e.getAttribute('title') ?? '', e.getAttribute('for') ?? '', e.getAttribute('value') ?? '', (e as HTMLElement).style.cssText,
        e.children.length || e.id === 'skyInfo' ? '' : e.textContent!.trim()].join('|'));   // #skyInfo: skyStart điền lúc chạy
    expect(sig(ours)).toEqual(sig(legacyPanel));
  });
});

describe('Sky behaviour', () => {
  it('starts with HCM info; changing #skyLoc to danang saves tarotSkyLoc and updates #skyInfo', async () => {
    await renderSky();
    expect($('skyInfo').textContent).toBe(INFO('TP.HCM'));
    fireEvent.change($('skyLoc'), { target: { value: 'danang' } });
    expect(localStorage.getItem('tarotSkyLoc')).toBe('danang');
    expect($('skyInfo').textContent).toBe(INFO('Đà Nẵng'));
  });

  it('restores the saved location', async () => {
    localStorage.setItem('tarotSkyLoc', 'cantho');
    await renderSky();
    expect($<HTMLSelectElement>('skyLoc').value).toBe('cantho');
    expect($('skyInfo').textContent).toBe(INFO('Cần Thơ'));
  });

  it('layer toggles flip .on and save the legacy JSON', async () => {
    localStorage.setItem('tarotSkyLayers', JSON.stringify({ grid: true }));
    await renderSky();
    expect($('skyTgGrid').className).toBe('sky-tg on');
    expect($('skyTgLines').className).toBe('sky-tg on');
    fireEvent.click($('skyTgLines'));
    expect($('skyTgLines').className).toBe('sky-tg');
    expect(localStorage.getItem('tarotSkyLayers')).toBe('{"lines":false,"grid":true,"bodies":true,"starsOnly":false}');
    fireEvent.click($('skyTgStars'));
    expect($('skyTgStars').className).toBe('sky-tg on');
    expect(localStorage.getItem('tarotSkyLayers')).toBe('{"lines":false,"grid":true,"bodies":true,"starsOnly":true}');
  });

  it('GPS success sets the location and saves gps', async () => {
    await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    expect(localStorage.getItem('tarotSkyLoc')).toBe('gps');
    expect($('skyInfo').textContent).toBe('Đang xin vị trí…');
    const [ok] = geo.getCurrentPosition.mock.calls[0]! as [PositionCallback];
    act(() => ok({ coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition));
    expect($('skyInfo').textContent).toBe(INFO('vị trí của bạn'));
  });

  it('GPS error shows the legacy text and keeps the previous location', async () => {
    await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'hanoi' } });
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    const [, err] = geo.getCurrentPosition.mock.calls[0]! as [PositionCallback, PositionErrorCallback];
    act(() => err({ code: 1 } as GeolocationPositionError));
    expect($('skyInfo').textContent).toBe('Bị từ chối định vị — hãy chọn một thành phố.');
    // vẫn là Hà Nội: lần đặt vị trí cuối cùng là Hà Nội, GPS lỗi không đặt lại
    const setLoc = engines[0]!.setLocation;
    expect(setLoc).toHaveBeenCalledTimes(1);
    expect(setLoc).toHaveBeenLastCalledWith(21.03, 105.85, 'Hà Nội');
    // đổi ngôn ngữ không đè chữ trạng thái GPS (chỉ dịch nó)
    act(() => useApp.setState({ lang: 'en' }));
    expect($('skyInfo').textContent).toBe('Location denied — pick a city instead.');
  });

  it('language change keeps the "requesting" status; the fix then replaces it', async () => {
    await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    act(() => useApp.setState({ lang: 'en' }));
    expect($('skyInfo').textContent).toBe('Requesting location…');
    const [ok] = geo.getCurrentPosition.mock.calls[0]! as [PositionCallback];
    act(() => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition));
    expect($('skyInfo').textContent).toBe('Real stars & constellations above your location right now. Zenith at centre, horizon at the edge. Drag to rotate, scroll/pinch to zoom.');
  });

  it('a late GPS answer after switching to a city is ignored (request token)', async () => {
    await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    fireEvent.change($('skyLoc'), { target: { value: 'danang' } });
    const [ok, err] = geo.getCurrentPosition.mock.calls[0]! as [PositionCallback, PositionErrorCallback];
    act(() => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition));
    act(() => err({ code: 1 } as GeolocationPositionError));
    expect(engines[0]!.setLocation).toHaveBeenCalledTimes(1);
    expect($('skyInfo').textContent).toBe(INFO('Đà Nẵng'));
    // gps → gps lần 2: chỉ lượt mới nhất được áp
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    const [ok2] = geo.getCurrentPosition.mock.calls[1]! as [PositionCallback];
    act(() => ok2({ coords: { latitude: 3, longitude: 4 } } as GeolocationPosition));
    expect(engines[0]!.setLocation).toHaveBeenCalledTimes(1);
  });

  it('a GPS callback after unmount does not throw and does not set the location', async () => {
    const r = await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    const [ok, err] = geo.getCurrentPosition.mock.calls[0]! as [PositionCallback, PositionErrorCallback];
    r.unmount();
    expect(() => {
      ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
      err({ code: 1 } as GeolocationPositionError);
    }).not.toThrow();
    expect(engines[0]!.setLocation).not.toHaveBeenCalled();
  });

  it('leaving and returning with gps selected keeps the last fix', async () => {
    const r = await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    const [ok] = geo.getCurrentPosition.mock.calls[0]! as [PositionCallback];
    act(() => ok({ coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition));
    r.unmount();
    await renderSky();
    expect($<HTMLSelectElement>('skyLoc').value).toBe('gps');
    expect($('skyInfo').textContent).toBe(INFO('vị trí của bạn'));
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);   // không xin lại
  });

  it('saved gps without a fix in this session draws TP.HCM (legacy), no permission prompt', async () => {
    localStorage.setItem('tarotSkyLoc', 'gps');
    await renderSky();
    expect($('skyInfo').textContent).toBe(INFO('TP.HCM'));
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('no geolocation → legacy unsupported text', async () => {
    delete (navigator as unknown as { geolocation?: unknown }).geolocation;
    await renderSky();
    fireEvent.change($('skyLoc'), { target: { value: 'gps' } });
    expect($('skyInfo').textContent).toBe('Thiết bị không hỗ trợ định vị.');
  });

  it('loadSky rejects → #skyInfo shows the failure text', async () => {
    loadSky.mockReset();
    loadSky.mockRejectedValue(new Error('404'));
    await renderSky();
    await act(async () => {});
    expect($('skyInfo').textContent).toBe('Không tải được dữ liệu bầu trời — kiểm tra mạng rồi thử lại.');
  });

  it('#skyFull: requestFullscreen on .sky-stage, exitFullscreen when already fullscreen, else unsupported text', async () => {
    await renderSky();
    const stage = document.querySelector('.sky-stage') as HTMLElement & { requestFullscreen?: unknown };
    fireEvent.click($('skyFull'));
    expect($('skyInfo').textContent).toBe('Thiết bị không hỗ trợ toàn màn hình.');
    const req = vi.fn(() => Promise.resolve());
    stage.requestFullscreen = req;
    fireEvent.click($('skyFull'));
    expect(req).toHaveBeenCalledTimes(1);
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenElement', { value: stage, configurable: true });
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    fireEvent.click($('skyFull'));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(req).toHaveBeenCalledTimes(1);
    delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
  });

  it('zoom buttons clamp at 0.6 / 2.6; reset restores zoom 1 and rotation 0', async () => {
    const arcs: number[] = [], rots: number[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (tg, p: string) => p in tg ? tg[p] : p === 'measureText' ? () => ({ width: 1 })
        : (...a: number[]) => { if (p === 'arc' && a[0] === 160 && a[1] === 210) arcs.push(a[2]!); if (p === 'rotate') rots.push(a[0]!); },
      set: (tg, p: string, v) => { tg[p] = v; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
    await renderSky();
    const frame = () => { arcs.length = 0; const cbs = [...pending.values()]; pending = new Map(); for (const cb of cbs) cb(0); return arcs.at(-1); };
    expect(frame()).toBeCloseTo(147.2, 6);
    for (let i = 0; i < 8; i++) fireEvent.click($('skyZoomIn'));
    expect(frame()).toBeCloseTo(147.2 * 2.6, 6);
    for (let i = 0; i < 12; i++) fireEvent.click($('skyZoomOut'));
    expect(frame()).toBeCloseTo(147.2 * 0.6, 6);
    fireEvent.click($('skyResetView'));
    expect(frame()).toBeCloseTo(147.2, 6);
    expect(rots.at(-1)).toBe(0);
  });

  it('unmount removes window resize / fullscreenchange listeners and cancels the rAF', async () => {
    const wRem = vi.spyOn(window, 'removeEventListener'), dRem = vi.spyOn(document, 'removeEventListener');
    const r = await renderSky();
    expect(pending.size).toBe(1);
    r.unmount();
    expect(pending.size).toBe(0);
    expect(wRem.mock.calls.some(c => c[0] === 'resize')).toBe(true);
    expect(dRem.mock.calls.some(c => c[0] === 'fullscreenchange')).toBe(true);
    expect(dRem.mock.calls.some(c => c[0] === 'webkitfullscreenchange')).toBe(true);
  });
});
