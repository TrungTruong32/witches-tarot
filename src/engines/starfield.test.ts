import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localSiderealDeg, julianDay } from '../core/astro';
import type { SkyData } from '../services/skyData';

const loadSky = vi.fn<() => Promise<SkyData>>();
vi.mock('../services/skyData', () => ({ loadSky: () => loadSky() }));

import { computeSkyScene, startStarfield } from './starfield';

// rAF giả: giữ hàng đợi, flush() chạy đúng một lượt khung hình
let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
const flush = () => {
  const cbs = [...pending.values()];
  pending = new Map();
  for (const cb of cbs) cb(0);
};

function fakeCtx() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === 'createLinearGradient') return () => (calls.push('gradient'), { addColorStop: () => {} });
      return (...a: unknown[]) => void calls.push(`${p}(${a.length})`);
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  });
  return { ctx, calls };
}

const OPTS = { fx: 'on' as const, skyMode: 'deco', skyCity: 'hanoi', reduce: false, colors: { star: '#fff', spark: '#ff0' } };

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
});
afterEach(() => vi.restoreAllMocks());

describe('startStarfield', () => {
  it('fx off dừng vòng rAF; bật lại chạy đúng một vòng', () => {
    const e = startStarfield(document.createElement('canvas'), OPTS);
    expect(pending.size).toBe(1);
    flush();
    expect(pending.size).toBe(1);
    e.update({ ...OPTS, fx: 'off' });
    expect(pending.size).toBe(0);
    flush();
    expect(pending.size).toBe(0);
    e.update({ ...OPTS, fx: 'on' });
    e.update({ ...OPTS, fx: 'on' });
    expect(pending.size).toBe(1);
    flush();
    expect(pending.size).toBe(1);
    e.stop();
    expect(pending.size).toBe(0);
  });

  it('document.hidden tạm dừng, visibilitychange chạy lại', () => {
    const e = startStarfield(document.createElement('canvas'), OPTS);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.size).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.size).toBe(1);
    e.stop();
  });

  it('burst vẽ hạt lấp lánh', () => {
    const e = startStarfield(document.createElement('canvas'), OPTS);
    flush();
    const before = fc.calls.filter(c => c === 'arc(5)').length;
    e.burst(10, 10, 5);
    flush();
    expect(fc.calls.filter(c => c === 'arc(5)').length - before).toBeGreaterThanOrEqual(5);
    e.stop();
  });

  it('reduce: không gắn mousemove, burst không vẽ hạt, không có sao băng', () => {
    const wa = vi.spyOn(window, 'addEventListener');
    const e = startStarfield(document.createElement('canvas'), { ...OPTS, reduce: true });
    expect(wa.mock.calls.some(c => c[0] === 'mousemove')).toBe(false);
    flush();
    fc.calls.length = 0;
    flush();
    const base = fc.calls.filter(c => c === 'arc(5)').length;   // chỉ sao trang trí tĩnh
    e.burst(10, 10, 5);
    fc.calls.length = 0;
    flush();
    expect(fc.calls.filter(c => c === 'arc(5)').length).toBe(base);
    for (let i = 0; i < 80; i++) flush();
    expect(fc.calls).not.toContain('gradient');
    e.stop();
  });

  it('không reduce: sao băng đầu tiên xuất hiện trong ~80 khung (1.2s)', () => {
    const e = startStarfield(document.createElement('canvas'), OPTS);
    for (let i = 0; i < 80; i++) flush();
    expect(fc.calls).toContain('gradient');
    e.stop();
  });

  it("skyMode='real' gọi loadSky một lần; bị từ chối → quay về sao trang trí, không lỗi treo", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadSky.mockReturnValue(Promise.reject(new Error('net')));
    const e = startStarfield(document.createElement('canvas'), { ...OPTS, skyMode: 'real' });
    flush();
    flush();
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(loadSky).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    fc.calls.length = 0;
    flush();
    expect(fc.calls.filter(c => c === 'arc(5)').length).toBeGreaterThan(0); // sao trang trí
    e.stop();
  });

  it('stop() gỡ mọi listener đã gắn (cùng handler)', () => {
    const wa = vi.spyOn(window, 'addEventListener');
    const wr = vi.spyOn(window, 'removeEventListener');
    const da = vi.spyOn(document, 'addEventListener');
    const dr = vi.spyOn(document, 'removeEventListener');
    const e = startStarfield(document.createElement('canvas'), OPTS);
    e.stop();
    expect(wa.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [type, fn] of wa.mock.calls) expect(wr.mock.calls.some(c => c[0] === type && c[1] === fn), type).toBe(true);
    for (const [type, fn] of da.mock.calls) expect(dr.mock.calls.some(c => c[0] === type && c[1] === fn), type).toBe(true);
    expect(pending.size).toBe(0);
  });

  it('getContext null → engine trơ, không lỗi', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => null);
    const e = startStarfield(document.createElement('canvas'), OPTS);
    expect(pending.size).toBe(0);
    e.burst(1, 1, 3);
    e.update({ ...OPTS, fx: 'off' });
    e.stop();
  });
});

describe('computeSkyScene', () => {
  it('lines dạng [abbr, poly] cho ra đoạn thẳng (sửa lỗi bản cũ)', () => {
    const date = new Date('2026-11-20T15:00:00Z');
    const lst = localSiderealDeg(julianDay(date), 105.85);
    // hai sao gần thiên đỉnh Hà Nội
    const sky: SkyData = {
      stars: [[lst, 21, 1]],
      lines: [['Ori', [[lst, 21], [(lst + 5) % 360, 25], [(lst + 8) % 360, 28]]]],
      names: [[lst, 21, 'Sao']],
      consts: [],
    };
    const s = computeSkyScene(sky, 'hanoi', date, 800, 600);
    expect(s.segs.length).toBe(2);
    expect(s.pts.length).toBe(1);
    expect(s.labels[0]?.t).toBe('Sao');
    expect(s.R).toBe(0.62 * 800);
    expect(s.cx).toBe(400);
    // gần thiên đỉnh → gần tâm
    expect(Math.hypot(s.segs[0]![0] - 400, s.segs[0]![1] - 300)).toBeLessThan(5);
  });
});
