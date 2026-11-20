import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { julianDay, localSiderealDeg } from '../core/astro';
import type { SkyData } from '../services/skyData';

const loadSky = vi.fn<() => Promise<SkyData>>();
// onSkyLoaded giả: emitSky(d) đóng vai lượt nạp thành công của engine kia
const skyListeners = vi.hoisted(() => new Set<(d: SkyData) => void>());
const emitSky = (d: SkyData) => { for (const cb of skyListeners) cb(d); };
vi.mock('../services/skyData', () => ({ loadSky: () => loadSky(), onSkyLoaded: (cb: (d: SkyData) => void) => { skyListeners.add(cb); return () => skyListeners.delete(cb); } }));

import { startSkyMap, type SkyMapOpts } from './skyMap';
import { SKY_CITIES } from './skyScene';
import { skyMapText } from '../features/sky/skyText';

const VI = skyMapText(p => p.vi), EN = skyMapText(p => p.en);

// rAF giả: giữ hàng đợi, flush() chạy đúng một lượt khung hình
let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
const flush = () => {
  const cbs = [...pending.values()];
  pending = new Map();
  for (const cb of cbs) cb(0);
};

/** ctx 2D giả: ghi lại tên hàm + đối số của mọi lệnh vẽ. */
function fakeCtx() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 10 });
      return (...args: unknown[]) => void calls.push({ fn: p, args });
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  });
  return { ctx, calls };
}

// Sao ở thiên đỉnh-ish của HCM để chắc chắn nằm trên chân trời
const SKY: SkyData = { stars: [], lines: [], names: [], consts: [] };
const OPTS: SkyMapOpts = { lat: 10.82, lon: 106.63, name: 'TP.HCM', layers: { lines: true, grid: false, bodies: true, starsOnly: false }, text: VI, colors: { star: '#fff' } };

let fc: ReturnType<typeof fakeCtx>;
beforeEach(() => {
  pending = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => void pending.delete(id));
  fc = fakeCtx();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fc.ctx as unknown as CanvasRenderingContext2D);
  loadSky.mockReset();
  skyListeners.clear();
});
afterEach(() => vi.restoreAllMocks());

/** Bán kính vòng chân trời ở khung hình gần nhất (jsdom: canvas 320×420, DPR 1 → R = 0.46·320·zoom). */
const horizonR = () => {
  const arcs = fc.calls.filter(c => c.fn === 'arc' && c.args[0] === 160 && c.args[1] === 210);
  return arcs.length ? (arcs[arcs.length - 1]!.args[2] as number) : null;
};
const lastRotate = () => fc.calls.filter(c => c.fn === 'rotate').pop()?.args[0];
const frame = () => { fc.calls.length = 0; flush(); };

describe('startSkyMap', () => {
  it('SKY_CITIES như bản cũ', () => {
    expect(SKY_CITIES).toEqual({ hcm: [10.82, 106.63, 'TP.HCM'], hanoi: [21.03, 105.85, 'Hà Nội'], danang: [16.05, 108.22, 'Đà Nẵng'], cantho: [10.03, 105.78, 'Cần Thơ'] });
  });

  it('báo chữ updateSkyInfo khi bắt đầu, đổi nơi, đổi ngôn ngữ', async () => {
    loadSky.mockResolvedValue(SKY);
    const onInfo = vi.fn();
    const e = startSkyMap(document.createElement('canvas'), OPTS, { onInfo });
    expect(onInfo).toHaveBeenLastCalledWith('Sao & chòm sao thật trên bầu trời TP.HCM ngay lúc này. Thiên đỉnh ở giữa, chân trời ở mép. Kéo để xoay, lăn/chụm để phóng to.');
    e.setLocation(16.05, 108.22, 'Đà Nẵng');
    expect(onInfo).toHaveBeenLastCalledWith('Sao & chòm sao thật trên bầu trời Đà Nẵng ngay lúc này. Thiên đỉnh ở giữa, chân trời ở mép. Kéo để xoay, lăn/chụm để phóng to.');
    e.update({ text: EN });
    expect(onInfo).toHaveBeenLastCalledWith('Real stars & constellations above Đà Nẵng right now. Zenith at centre, horizon at the edge. Drag to rotate, scroll/pinch to zoom.');
    e.stop();
  });

  it('sky.json lỗi → báo chữ lỗi (VI/EN); đổi nơi thì tải lại', async () => {
    loadSky.mockRejectedValue(new Error('net'));
    const onInfo = vi.fn();
    const e = startSkyMap(document.createElement('canvas'), OPTS, { onInfo });
    await vi.waitFor(() => expect(onInfo).toHaveBeenLastCalledWith('Không tải được dữ liệu bầu trời — kiểm tra mạng rồi thử lại.'));
    e.update({ text: EN });
    expect(onInfo).toHaveBeenLastCalledWith("Couldn't load the sky data — check your connection and try again.");
    loadSky.mockResolvedValue(SKY);
    e.setLocation(21.03, 105.85, 'Hà Nội');
    expect(loadSky).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(onInfo).toHaveBeenLastCalledWith('Real stars & constellations above Hà Nội right now. Zenith at centre, horizon at the edge. Drag to rotate, scroll/pinch to zoom.'));
    e.stop();
  });

  it('sky.json lỗi → chữ lỗi; nền nạp được (onSkyLoaded) → chữ hướng dẫn và vẽ bầu trời', async () => {
    loadSky.mockRejectedValue(new Error('net'));
    const onInfo = vi.fn();
    const e = startSkyMap(document.createElement('canvas'), OPTS, { onInfo });
    await vi.waitFor(() => expect(onInfo).toHaveBeenLastCalledWith(VI.fail));
    frame();
    expect(horizonR()).toBeNull();   // chưa có dữ liệu: chỉ chữ lỗi
    emitSky(SKY);
    expect(onInfo).toHaveBeenLastCalledWith(VI.info('TP.HCM'));
    frame();
    expect(horizonR()).toBeCloseTo(147.2, 6);
    e.stop();
    expect(skyListeners.size).toBe(0);
  });

  it('zoomBy kẹp trong 0.6–2.6; reset về xoay 0, zoom 1', async () => {
    loadSky.mockResolvedValue(SKY);
    const cv = document.createElement('canvas');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    await vi.waitFor(() => expect(loadSky).toHaveBeenCalled());
    await Promise.resolve();
    frame();
    expect(cv.width).toBe(320);
    expect(cv.height).toBe(420);
    expect(horizonR()).toBeCloseTo(147.2, 6);
    for (let i = 0; i < 10; i++) e.zoomBy(1.2);
    frame();
    expect(horizonR()).toBeCloseTo(147.2 * 2.6, 6);
    for (let i = 0; i < 20; i++) e.zoomBy(1 / 1.2);
    frame();
    expect(horizonR()).toBeCloseTo(147.2 * 0.6, 6);
    // kéo xoay 100px → 0.6 rad
    cv.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1, clientX: 100, clientY: 100 }));
    cv.dispatchEvent(Object.assign(new Event('pointermove'), { pointerId: 1, clientX: 200, clientY: 100 }));
    cv.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1, clientX: 200, clientY: 100 }));
    frame();
    expect(lastRotate()).toBeCloseTo(0.6, 9);
    e.reset();
    frame();
    expect(lastRotate()).toBe(0);
    expect(horizonR()).toBeCloseTo(147.2, 6);
    e.stop();
  });

  it('wheel: ×1.1 / ×0.9, không passive (preventDefault)', async () => {
    loadSky.mockResolvedValue(SKY);
    const cv = document.createElement('canvas');
    const add = vi.spyOn(cv, 'addEventListener');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    await vi.waitFor(() => expect(loadSky).toHaveBeenCalled());
    await Promise.resolve();
    expect(add.mock.calls.find(c => c[0] === 'wheel')![2]).toEqual({ passive: false });
    const w = new WheelEvent('wheel', { deltaY: -1, cancelable: true });
    cv.dispatchEvent(w);
    expect(w.defaultPrevented).toBe(true);
    frame();
    expect(horizonR()).toBeCloseTo(147.2 * 1.1, 6);
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, cancelable: true }));
    frame();
    expect(horizonR()).toBeCloseTo(147.2 * 1.1 * 0.9, 6);
    e.stop();
  });

  it('chạm < 6px chọn sao gần nhất trong 20px → hộp thông tin trên canvas', async () => {
    // một sao gần thiên đỉnh HCM lúc này: dùng phép chiếu để lấy toạ độ; ở đây chỉ cần sao ở đúng tâm → RA = LST, Dec = vĩ độ
    const lst = localSiderealDeg(julianDay(new Date()), OPTS.lon);
    loadSky.mockResolvedValue({ stars: [[lst, OPTS.lat, 1]], lines: [], names: [[lst, OPTS.lat, 'Zen']], consts: [] });
    const cv = document.createElement('canvas');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    await vi.waitFor(() => expect(loadSky).toHaveBeenCalled());
    await Promise.resolve();
    frame();
    cv.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1, clientX: 162, clientY: 212 }));
    cv.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1, clientX: 162, clientY: 212 }));
    frame();
    const texts = fc.calls.filter(c => c.fn === 'fillText').map(c => c.args[0]);
    expect(texts).toContain('Cấp sáng 1.0');
    e.stop();
  });

  it('chụm 2 ngón → 1 ngón: không nhảy góc xoay, nhấc hết tay thì map rỗng và không chọn sao (phán quyết)', async () => {
    const lst = localSiderealDeg(julianDay(new Date()), OPTS.lon);
    loadSky.mockResolvedValue({ stars: [[lst, OPTS.lat, 1]], lines: [], names: [], consts: [] });
    const cv = document.createElement('canvas');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    await vi.waitFor(() => expect(loadSky).toHaveBeenCalled());
    await Promise.resolve();
    const ev = (type: string, pointerId: number, clientX: number, clientY = 212) => cv.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY }));
    const boxed = () => fc.calls.some(c => c.fn === 'fillText' && c.args[0] === 'Cấp sáng 1.0');
    ev('pointerdown', 1, 162);
    ev('pointerdown', 2, 163);   // ngón thứ 2 gần như không đi đâu
    expect(cv.classList.contains('grabbing')).toBe(true);
    ev('pointerup', 2, 163);
    frame();
    expect(lastRotate()).toBe(0);   // còn 1 ngón: không nhảy
    ev('pointermove', 1, 212);      // kéo tiếp 50px từ chỗ ngón 1 đang đứng → +0.3 rad
    frame();
    expect(lastRotate()).toBeCloseTo(0.3, 9);
    ev('pointermove', 1, 162);
    ev('pointerup', 1, 162);
    expect(cv.classList.contains('grabbing')).toBe(false);   // map ngón rỗng
    frame();
    expect(boxed()).toBe(false);
    // lượt chạm mới (1 ngón) lại chọn được sao
    e.reset();
    ev('pointerdown', 3, 162);
    ev('pointerup', 3, 162);
    frame();
    expect(boxed()).toBe(true);
    e.stop();
  });

  it('chụm rồi nhấc cả hai ngón gần như không di chuyển → không chọn sao', async () => {
    const lst = localSiderealDeg(julianDay(new Date()), OPTS.lon);
    loadSky.mockResolvedValue({ stars: [[lst, OPTS.lat, 1]], lines: [], names: [], consts: [] });
    const cv = document.createElement('canvas');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    await vi.waitFor(() => expect(loadSky).toHaveBeenCalled());
    await Promise.resolve();
    const ev = (type: string, pointerId: number, clientX: number) => cv.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY: 212 }));
    ev('pointerdown', 1, 162); ev('pointerdown', 2, 170); ev('pointerup', 1, 162); ev('pointerup', 2, 170);
    frame();
    expect(fc.calls.some(c => c.fn === 'fillText' && c.args[0] === 'Cấp sáng 1.0')).toBe(false);
    e.stop();
  });

  it('lấy ctx 2D đúng một lần; DPR transform đặt lại sau mỗi lần resize, không phải mỗi khung', async () => {
    loadSky.mockResolvedValue(SKY);
    const e = startSkyMap(document.createElement('canvas'), OPTS, { onInfo: () => {} });
    await vi.waitFor(() => expect(loadSky).toHaveBeenCalled());
    await Promise.resolve();
    frame();
    frame();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1);
    expect(fc.calls.some(c => c.fn === 'setTransform')).toBe(false);
    fc.calls.length = 0;
    window.dispatchEvent(new Event('resize'));
    expect(fc.calls).toEqual([{ fn: 'setTransform', args: [1, 0, 0, 1, 0, 0] }]);
    e.stop();
  });

  it('stop() gỡ mọi listener (window resize, fullscreenchange, canvas) và huỷ rAF', () => {
    loadSky.mockReturnValue(new Promise(() => {}));
    const cv = document.createElement('canvas');
    const wAdd = vi.spyOn(window, 'addEventListener'), wRem = vi.spyOn(window, 'removeEventListener');
    const dAdd = vi.spyOn(document, 'addEventListener'), dRem = vi.spyOn(document, 'removeEventListener');
    const cAdd = vi.spyOn(cv, 'addEventListener'), cRem = vi.spyOn(cv, 'removeEventListener');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    expect(pending.size).toBe(1);
    e.stop();
    expect(pending.size).toBe(0);
    flush();
    expect(pending.size).toBe(0);
    const same = (add: typeof wAdd, rem: typeof wRem, type: string) => {
      const h = add.mock.calls.find(c => c[0] === type)?.[1];
      expect(h, type).toBeTruthy();
      expect(rem.mock.calls.some(c => c[0] === type && c[1] === h), type).toBe(true);
    };
    same(wAdd, wRem, 'resize');
    same(dAdd, dRem, 'fullscreenchange');
    same(dAdd, dRem, 'webkitfullscreenchange');
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) same(cAdd, cRem, t);
  });
});
