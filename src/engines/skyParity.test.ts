// Khoá đầu ra vẽ của hai engine bầu trời (nền starfield + bản đồ sao skyMap) bằng snapshot nhật ký lệnh canvas:
// tách phần dựng cảnh dùng chung (skyScene) không được đổi một con số nào. Đồng hồ cố định, dữ liệu sao cố định.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkyData } from '../services/skyData';

const loadSky = vi.fn<() => Promise<SkyData>>();
vi.mock('../services/skyData', () => ({ loadSky: () => loadSky(), onSkyLoaded: () => () => {} }));

import { startSkyMap } from './skyMap';
import { startStarfield } from './starfield';

// 2026-11-20 15:00 UTC: Mặt Trăng (~80%) và Sao Thổ đều trên chân trời Hà Nội lẫn TP.HCM; LST ≈ 30.5° (HN), 31.3° (HCM)
const NOW = new Date('2026-11-20T15:00:00Z');
const FIX: SkyData = {
  stars: [
    [31.3, 10.82, 1], [34, 13, 2.4], [28, 8, 3.5], [36, 18, 0.2], [25, 15, 4.8],
    [30.5, 21.03, 1.6], [40, 25, 2], [20, 30, 5.5], [200, -70, 1],   // sao cuối dưới chân trời
  ],
  lines: [
    ['Ari', [[31.3, 10.82], [34, 13], [36, 18]]],
    ['Psc', [[28, 8], [25, 15], [200, -70]]],   // đoạn thứ hai rơi xuống dưới chân trời → bỏ
  ],
  names: [[31.3, 10.82, 'Hamal'], [36, 18, 'Sheratan'], [30.5, 21.03, 'Zen']],
  consts: [[33, 12, 'Bạch Dương', 'Ari'], [26, 11, 'Song Ngư', 'Psc'], [200, -70, 'Dưới', 'Low']],
};

// rAF giả: flush() chạy đúng một lượt khung hình
let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
const flush = () => {
  const cbs = [...pending.values()];
  pending = new Map();
  for (const cb of cbs) cb(0);
};

/** ctx 2D giả ghi mọi lời gọi (kèm đối số) và mọi lần gán thuộc tính, theo đúng thứ tự. */
function recCtx() {
  const log: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s: string) => (log.push(`measureText(${s})`), { width: s.length * 6 });
      if (p === 'createLinearGradient') return (...a: unknown[]) => (log.push(`gradient(${a.join(',')})`), { addColorStop: () => {} });
      // setTransform: M9 chuyển DPR transform sang resize() — không thuộc phần cần khoá
      if (p === 'setTransform') return () => {};
      return (...a: unknown[]) => void log.push(`${p}(${a.join(',')})`);
    },
    set(t, p: string, v) {
      t[p] = v;
      log.push(`${p}=${String(v)}`);
      return true;
    },
  });
  return { ctx, log };
}

let rc: ReturnType<typeof recCtx>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  pending = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => void pending.delete(id));
  rc = recCtx();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => rc.ctx as unknown as CanvasRenderingContext2D);
  loadSky.mockReset();
  loadSky.mockResolvedValue(FIX);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const frame = () => { rc.log.length = 0; flush(); return [...rc.log]; };

describe('starfield: bầu trời thật', () => {
  const OPTS = { fx: 'on' as const, skyMode: 'real', skyCity: 'hanoi', reduce: false, colors: { star: '#fff', spark: '#ff0' } };

  it.each(['hanoi', 'hcm', 'danang'])('khung hình đầu tại %s khớp snapshot', async city => {
    const e = startStarfield(document.createElement('canvas'), { ...OPTS, skyCity: city });
    await settle();
    const log = frame();
    // canh: có Mặt Trăng (bóng pha → clip) và đường chòm sao
    expect(log).toContain('clip()');
    expect(log.some(l => l.startsWith('fillText(Mặt Trăng,'))).toBe(true);
    expect(log.filter(l => l.startsWith('moveTo(')).length).toBeGreaterThan(1);
    expect(log).toMatchSnapshot();
    e.stop();
  });

  it('thành phố lạ (kể cả cantho) → Hà Nội như bản cũ', async () => {
    const a = startStarfield(document.createElement('canvas'), { ...OPTS, skyCity: 'hanoi' });
    await settle();
    const hn = frame();
    a.stop();
    for (const city of ['cantho', 'xyz']) {
      const b = startStarfield(document.createElement('canvas'), { ...OPTS, skyCity: city });
      await settle();
      expect(frame()).toEqual(hn);
      b.stop();
    }
  });
});

describe('skyMap: khung hình', () => {
  const OPTS = { lat: 10.82, lon: 106.63, name: 'TP.HCM', layers: { lines: true, grid: true, bodies: true, starsOnly: false }, lang: 'vi' as const, colors: { star: '#eee' } };

  it('lưới + chòm + thiên thể, rồi chạm chọn sao ở thiên đỉnh (nổi bật chòm + hộp thông tin) khớp snapshot', async () => {
    const cv = document.createElement('canvas');
    const e = startSkyMap(cv, OPTS, { onInfo: () => {} });
    await settle();
    const plain = frame();
    expect(plain).toContain('clip()');   // Mặt Trăng
    expect(plain.some(l => l.startsWith('fillText(Bạch Dương,'))).toBe(true);
    expect(plain).toMatchSnapshot('plain');
    // chạm tâm canvas (320×420 → 160,210): sao Hamal ở thiên đỉnh HCM, chòm gần nhất là Ari (có đường)
    cv.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1, clientX: 160, clientY: 210 }));
    cv.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1, clientX: 160, clientY: 210 }));
    const picked = frame();
    expect(picked.filter(l => l.startsWith('fillText(Hamal,')).length).toBe(2);   // nhãn sao + dòng 1 của hộp
    expect(picked).toContain('font=italic 700 14px Georgia, serif');   // tên chòm đang chọn
    expect(picked.some(l => l.startsWith('fillText(Cấp sáng 1.0 · Bạch Dương,'))).toBe(true);
    expect(picked).toMatchSnapshot('picked');
    // EN: chữ trong hộp + la bàn
    e.setLang('en');
    const en = frame();
    expect(en.some(l => l.startsWith('fillText(Mag 1.0 · Bạch Dương,'))).toBe(true);
    expect(en).toMatchSnapshot('picked-en');
    e.stop();
  });

  it('starsOnly: chỉ sao + vòng chân trời + la bàn', async () => {
    const e = startSkyMap(document.createElement('canvas'), { ...OPTS, layers: { lines: true, grid: true, bodies: true, starsOnly: true } }, { onInfo: () => {} });
    await settle();
    const log = frame();
    expect(log).not.toContain('clip()');
    expect(log).toMatchSnapshot();
    e.stop();
  });
});
