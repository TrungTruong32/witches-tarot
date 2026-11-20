import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import { deckCards } from '../../tests/fixtures/deck';
import { toSpreadCard } from '../core/draw';
import type { SpreadCard } from '../core/types';
import { ensureAudio, getAudioCtx, setSfxEnabled, sfx } from './audio';
import { burstAt, haptic } from './burst';
import { dealBoard } from './deal';
import { startShuffle } from './shuffle';
import { startWheel, type WheelOpts } from './wheel';
import { zodiacWheelHTML } from './zodiacWheel';

const animStub = () => ({ cancel: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(animStub);
});
afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  document.body.innerHTML = '';
  delete (window as unknown as { tarotBurst?: unknown }).tarotBurst;
});

const mount = (cls = '') => {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  document.body.appendChild(el);
  return el;
};

describe('zodiacWheelHTML', () => {
  it('is byte-equal to legacy', () => {
    const { zodiacWheelHTML: legacy } = loadLegacy<{ zodiacWheelHTML(): string }>(['zodiacWheelHTML']);
    expect(zodiacWheelHTML()).toBe(legacy());
  });
});

describe('audio sfx', () => {
  it('is a no-op before ensureAudio and exposes no ctx', () => {
    expect(getAudioCtx()).toBeNull();
    expect(() => {
      sfx.flick(0, 0, 1);
      sfx.whoosh(0, 1, 1);
      sfx.thump(0, 1);
      sfx.chime(0, 0, 1);
      sfx.tick();
      sfx.startTicks();
      sfx.stopTicks();
      sfx.stopAll();
    }).not.toThrow();
  });
  it('ensureAudio returns null without AudioContext, never throws', () => {
    expect(ensureAudio()).toBeNull();
  });
  it('stopAll stops tracked sources; disabled sfx schedule nothing', () => {
    const stop = vi.fn();
    const node = (): Record<string, unknown> => ({
      connect: vi.fn(() => node()),
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      Q: { value: 0 },
      pan: { setValueAtTime: vi.fn() },
      playbackRate: { value: 1 },
      start: vi.fn(),
      stop,
      type: '',
      buffer: null,
      onended: null,
    });
    const created: unknown[] = [];
    class FakeCtx {
      state = 'running';
      sampleRate = 1000;
      currentTime = 0;
      destination = {};
      resume = vi.fn();
      createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
      createBufferSource = () => {
        const n = node();
        created.push(n);
        return n;
      };
      createOscillator = () => {
        const n = node();
        created.push(n);
        return n;
      };
      createGain = node;
      createBiquadFilter = node;
      createStereoPanner = node;
      createConvolver = node;
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    expect(ensureAudio()).toBeInstanceOf(FakeCtx);
    expect(getAudioCtx()).toBe(ensureAudio());
    setSfxEnabled(false, 0.5);
    sfx.flick(0, 0, 1);
    expect(created.length).toBe(0);
    setSfxEnabled(true, 0.5);
    sfx.flick(0, 0, 1);
    expect(created.length).toBe(1);
    sfx.stopAll();
    expect(stop).toHaveBeenCalledWith(0);
    vi.unstubAllGlobals();
  });
});

describe('startShuffle', () => {
  it('appends wheel + 24 riffle cards and leaves no timers after stop', () => {
    const el = mount('orbit');
    const h = startShuffle(el, 78);
    expect(el.querySelectorAll('.zwheel')).toHaveLength(1);
    expect(el.querySelectorAll('.riffle-card')).toHaveLength(24);
    vi.advanceTimersByTime(3500); // hết vòng xoáy → sang riffle
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    h.stop();
    expect(vi.getTimerCount()).toBe(0);
    const before = el.innerHTML;
    vi.advanceTimersByTime(10000);
    expect(el.innerHTML).toBe(before);
  });
  it('clamps N to 8..24', () => {
    const a = mount();
    startShuffle(a, 3).stop();
    expect(a.querySelectorAll('.riffle-card')).toHaveLength(8);
    const b = mount();
    startShuffle(b, 12).stop();
    expect(b.querySelectorAll('.riffle-card')).toHaveLength(12);
  });
  it('stop right after start clears the show rAF', () => {
    const el = mount();
    startShuffle(el, 78).stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(el.querySelector('.zwheel.show')).toBeNull();
  });
});

const pool: SpreadCard[] = deckCards.slice(0, 10).map(c => toSpreadCard({ ...c, orientation: 'xuoi' } as SpreadCard));
const mkOpts = (over: Partial<WheelOpts> = {}): WheelOpts & { status: string[]; done: SpreadCard[][] } => {
  const status: string[] = [];
  const done: SpreadCard[][] = [];
  return {
    pool,
    n: 3,
    auto: false,
    lang: 'vi',
    reduce: false,
    onStatus: t => status.push(t),
    onDone: c => done.push(c),
    reshufflePool: () => [...pool].reverse(),
    status,
    done,
    ...over,
  };
};
const flush = (ms = 20) => vi.advanceTimersByTime(ms);

describe('startWheel manual', () => {
  it('builds wcards + reshuffle button and spreads after double rAF', () => {
    const fan = mount();
    const o = mkOpts();
    startWheel(fan, o);
    expect(fan.querySelectorAll('.wcard')).toHaveLength(pool.length);
    expect(fan.querySelectorAll('.fan-reshuffle')).toHaveLength(1);
    expect(fan.classList.contains('spread')).toBe(false);
    flush(40);
    expect(fan.classList.contains('spread')).toBe(true);
    expect(fan.querySelector('.zwheel.show')).not.toBeNull();
  });
  it('picks in click order, calls onDone after the reveal timings; legacy status VI', () => {
    const fan = mount();
    const o = mkOpts();
    startWheel(fan, o);
    flush(40);
    const w = fan.querySelectorAll<HTMLElement>('.wcard');
    expect(o.status).toEqual(['Chạm để bốc 3 lá từ bánh xe bài (0/3).']);
    w[4]!.click();
    w[1]!.click();
    w[7]!.click();
    expect(o.status.at(-1)).toBe('Chạm để bốc 3 lá từ bánh xe bài (3/3).');
    expect(fan.classList.contains('locked')).toBe(true);
    const total = 700 + 1500 + 3 * 380 + 1300;
    flush(total - 1);
    expect(o.done).toHaveLength(0);
    flush(1);
    expect(o.done).toHaveLength(1);
    expect(o.done[0]!.map(c => c.id)).toEqual([pool[4]!.id, pool[1]!.id, pool[7]!.id]);
    expect(fan.classList.contains('chosen')).toBe(true);
    expect(fan.querySelectorAll('.flip.revealed')).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('EN status texts and plural', () => {
    const o = mkOpts({ lang: 'en', n: 1 });
    startWheel(mount(), o);
    expect(o.status[0]).toBe('Tap to draw 1 card from the wheel (0/1).');
    const o2 = mkOpts({ lang: 'en', n: 3 });
    startWheel(mount(), o2);
    expect(o2.status[0]).toBe('Tap to draw 3 cards from the wheel (0/3).');
  });
  it('ignores clicks before spread, on picked cards and past n', () => {
    const fan = mount();
    const o = mkOpts({ n: 2 });
    startWheel(fan, o);
    const w = fan.querySelectorAll<HTMLElement>('.wcard');
    w[0]!.click();
    expect(o.status).toHaveLength(1);
    flush(40);
    w[0]!.click();
    w[0]!.click();
    expect(o.status).toHaveLength(2);
  });
  it('reshuffle swaps the pool then picks use the new pool', () => {
    const fan = mount();
    const o = mkOpts({ n: 1 });
    startWheel(fan, o);
    flush(40);
    fan.querySelector<HTMLElement>('.fan-reshuffle')!.click();
    expect(fan.classList.contains('reshuffle')).toBe(true);
    flush(1100);
    expect(fan.classList.contains('reshuffle')).toBe(false);
    flush(700);
    fan.querySelectorAll<HTMLElement>('.wcard')[0]!.click();
    flush(5000);
    expect(o.done[0]![0]!.id).toBe(pool[pool.length - 1]!.id);
  });
  it('cancel mid-reveal: no onDone, no timers', () => {
    const fan = mount();
    const o = mkOpts({ n: 1 });
    const h = startWheel(fan, o);
    flush(40);
    fan.querySelectorAll<HTMLElement>('.wcard')[2]!.click();
    flush(2300);
    h.cancel();
    expect(vi.getTimerCount()).toBe(0);
    flush(10000);
    expect(o.done).toHaveLength(0);
  });
  it('reduce: onDone in the same flush', () => {
    const fan = mount();
    const o = mkOpts({ n: 2, reduce: true });
    startWheel(fan, o);
    expect(fan.classList.contains('spread')).toBe(true);
    const w = fan.querySelectorAll<HTMLElement>('.wcard');
    w[0]!.click();
    w[3]!.click();
    vi.advanceTimersByTime(0);
    expect(o.done).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('startWheel auto', () => {
  it('picks n cards without clicks, ignores user clicks', () => {
    const fan = mount();
    const o = mkOpts({ n: 3, auto: true });
    startWheel(fan, o);
    expect(fan.querySelector('.fan-reshuffle')).toBeNull();
    expect(o.status[0]).toBe('✦ Các lá bài đang tự tìm đến bạn… (0/3)');
    flush(40);
    fan.querySelectorAll<HTMLElement>('.wcard')[0]!.click();
    expect(fan.querySelectorAll('.picked')).toHaveLength(0);
    flush(1700 + 3 * 460 + 700 + 1500 + 3 * 380 + 1300);
    expect(o.done).toHaveLength(1);
    expect(o.done[0]).toHaveLength(3);
    expect(new Set(o.done[0]!.map(c => c.id)).size).toBe(3);
    expect(o.status.at(-1)).toBe('✦ Các lá bài đang tự tìm đến bạn… (3/3)');
  });
  it('reduce auto completes at once', () => {
    const fan = mount();
    const o = mkOpts({ n: 2, auto: true, reduce: true, lang: 'en' });
    startWheel(fan, o);
    vi.advanceTimersByTime(0);
    expect(o.done[0]).toHaveLength(2);
  });
});

describe('dealBoard', () => {
  const board = (k: number) => {
    const b = mount('spread-board');
    for (let i = 0; i < k; i++) {
      const c = document.createElement('div');
      c.className = 'board-card await' + (i === 1 ? ' cross' : '');
      b.appendChild(c);
    }
    return b;
  };
  it('reduce: reveals all at once and calls done', () => {
    const b = board(3);
    const done = vi.fn();
    dealBoard(b, true, done);
    expect(b.querySelectorAll('.board-card.revealed')).toHaveLength(3);
    expect(b.querySelectorAll('.await')).toHaveLength(0);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it('animated: done after (k-1)*STEP+560+700; cards reveal on schedule', () => {
    const b = board(3);
    const done = vi.fn();
    dealBoard(b, false, done);
    expect(b.querySelectorAll('.await')).toHaveLength(0);
    const total = 2 * 280 + 560 + 700;
    flush(total - 1);
    expect(done).not.toHaveBeenCalled();
    flush(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(b.querySelectorAll('.revealed')).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('STEP is 190 for more than 7 cards', () => {
    const b = board(8);
    const done = vi.fn();
    dealBoard(b, false, done);
    flush(7 * 190 + 560 + 700);
    expect(done).toHaveBeenCalled();
  });
  it('cancel prevents done and leaves no timers', () => {
    const b = board(3);
    const done = vi.fn();
    const cancel = dealBoard(b, false, done);
    flush(300);
    cancel();
    expect(vi.getTimerCount()).toBe(0);
    flush(5000);
    expect(done).not.toHaveBeenCalled();
  });
  it('no awaiting cards: done immediately', () => {
    const done = vi.fn();
    dealBoard(mount(), false, done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('burst / haptic', () => {
  it('burstAt is a no-op without tarotBurst, else calls it with the centre', () => {
    const el = mount();
    expect(() => burstAt(el, 5)).not.toThrow();
    const fn = vi.fn();
    (window as unknown as { tarotBurst: unknown }).tarotBurst = fn;
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 40 }) as DOMRect;
    burstAt(el, 7);
    expect(fn).toHaveBeenCalledWith(60, 40, 7);
  });
  it('haptic calls navigator.vibrate and swallows errors', () => {
    const v = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: v, configurable: true });
    haptic();
    expect(v).toHaveBeenCalledWith(12);
    haptic(8);
    expect(v).toHaveBeenCalledWith(8);
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        throw new Error('x');
      },
      configurable: true,
    });
    expect(() => haptic()).not.toThrow();
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
  });
});
