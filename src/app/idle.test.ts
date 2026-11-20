import { describe, expect, it, vi } from 'vitest';
import { afterFirstPaint, IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS, type IdleHost } from './idle';

/** Host giả: ghi lại hàng đợi rAF / timeout / idle để chạy từng bước bằng tay. */
function fakeHost(withIdle: boolean) {
  const raf: (() => void)[] = [];
  const timers: { cb: () => void; ms?: number }[] = [];
  const idles: { cb: () => void; opts?: { timeout: number } }[] = [];
  const host: IdleHost = {
    requestAnimationFrame: cb => raf.push(cb),
    setTimeout: (cb, ms) => timers.push({ cb, ms }),
    ...(withIdle ? { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => idles.push({ cb, opts }) } : {}),
  };
  return { host, raf, timers, idles };
}

describe('afterFirstPaint', () => {
  it('rAF → setTimeout 0 → requestIdleCallback (có timeout) → chạy việc, không chạy sớm hơn', () => {
    const fn = vi.fn();
    const h = fakeHost(true);
    afterFirstPaint(fn, h.host);
    expect(h.raf).toHaveLength(1);
    expect(fn).not.toHaveBeenCalled();
    h.raf[0]!();
    expect(h.timers).toEqual([{ cb: expect.any(Function), ms: 0 }]);
    h.timers[0]!.cb();
    expect(h.idles[0]!.opts).toEqual({ timeout: IDLE_TIMEOUT_MS });
    expect(fn).not.toHaveBeenCalled();
    h.idles[0]!.cb();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('không có requestIdleCallback → setTimeout', () => {
    const fn = vi.fn();
    const h = fakeHost(false);
    afterFirstPaint(fn, h.host);
    h.raf[0]!();
    h.timers[0]!.cb();
    expect(h.timers[1]!.ms).toBe(IDLE_FALLBACK_MS);
    expect(fn).not.toHaveBeenCalled();
    h.timers[1]!.cb();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
