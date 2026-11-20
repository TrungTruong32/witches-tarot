// Hai engine dùng chung một lượt nạp sky.json thật (services/skyData, không mock): engine này nạp lại được thì engine kia cũng thấy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetForTests, type SkyData } from '../services/skyData';
import { startSkyMap } from './skyMap';
import { startStarfield } from './starfield';
import { skyMapText } from '../features/sky/skyText';

const SKY: SkyData = { stars: [], lines: [], names: [], consts: [] };
const VI = skyMapText(p => p.vi);
const BG = { fx: 'on' as const, skyMode: 'real', skyCity: 'hanoi', reduce: false, colors: { star: '#fff', spark: '#ff0' } };
const MAP = { lat: 10.82, lon: 106.63, name: 'TP.HCM', layers: { lines: true, grid: false, bodies: true, starsOnly: false }, text: VI, colors: { star: '#fff' } };

let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
/** Nhật ký vẽ riêng của canvas nền. */
const log: string[] = [];
let bgCanvas: HTMLCanvasElement;
const frame = () => {
  log.length = 0;
  const cbs = [...pending.values()];
  pending = new Map();
  for (const cb of cbs) cb(0);
};
/** Nền đang vẽ vòm thật? (la bàn chỉ có ở drawSky; sao trang trí không vẽ chữ) */
const bgReal = () => log.some(l => l.startsWith('fillText(Đ,'));
const fetchMock = vi.fn<() => Promise<Response>>();
const ok = () => Promise.resolve({ ok: true, json: async () => SKY } as unknown as Response);
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => {
  resetForTests();
  pending = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { const id = nextId++; pending.set(id, cb); return id; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => void pending.delete(id));
  bgCanvas = document.createElement('canvas');
  const makeCtx = (out: string[] | null) => new Proxy({} as Record<string, unknown>, {
    get: (t, p: string) => (p in t ? t[p] : p === 'measureText' ? () => ({ width: 1 }) : p === 'createLinearGradient' ? () => ({ addColorStop: () => {} }) : (...a: unknown[]) => void out?.push(`${p}(${a.join(',')})`)),
    set: (t, p: string, v) => ((t[p] = v), true),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return makeCtx(this === bgCanvas ? log : null) as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetForTests();
});

describe('sky.json dùng chung giữa nền và bản đồ sao', () => {
  it('nền lỗi → sao trang trí; bản đồ sao đổi nơi tải lại được → nền chuyển sang bầu trời thật', async () => {
    fetchMock.mockRejectedValue(new Error('net'));
    const bg = startStarfield(bgCanvas, BG);
    const onInfo = vi.fn();
    const map = startSkyMap(document.createElement('canvas'), MAP, { onInfo });
    await settle();
    expect(onInfo).toHaveBeenLastCalledWith(VI.fail);
    frame();
    expect(log.length).toBeGreaterThan(0);
    expect(bgReal()).toBe(false);   // nền: sao trang trí
    // bản đồ sao: đổi nơi khi đang lỗi → tải lại, lần này được
    fetchMock.mockImplementation(ok);
    map.setLocation(21.03, 105.85, 'Hà Nội');
    await settle();
    expect(onInfo).toHaveBeenLastCalledWith(VI.info('Hà Nội'));
    frame();
    expect(bgReal()).toBe(true);   // nền đã thấy lượt nạp của bản đồ sao
    map.stop();
    bg.stop();
  });

  it('bản đồ sao lỗi → chữ lỗi; nền bật lại bầu trời thật và tải được → bản đồ sao đổi sang chữ hướng dẫn', async () => {
    fetchMock.mockRejectedValue(new Error('net'));
    const onInfo = vi.fn();
    const map = startSkyMap(document.createElement('canvas'), MAP, { onInfo });
    const bg = startStarfield(bgCanvas, BG);
    await settle();
    expect(onInfo).toHaveBeenLastCalledWith(VI.fail);
    fetchMock.mockImplementation(ok);
    bg.update({ ...BG, skyMode: 'deco' });
    bg.update(BG);   // deco → real: thử nạp lại
    await settle();
    expect(onInfo).toHaveBeenLastCalledWith(VI.info('TP.HCM'));
    map.stop();
    bg.stop();
  });
});
