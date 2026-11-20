import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '../app/store';
import { Background } from './Background';

type W = { tarotBurst?: (x: number, y: number, n: number) => void };

let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
beforeEach(() => {
  pending = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => void pending.delete(id));
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, p: string) => (p in t ? t[p] : p === 'createLinearGradient' ? () => ({ addColorStop: () => {} }) : () => {}),
    set: (t, p: string, v) => ((t[p] = v), true),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  act(() => useApp.setState(s => ({ prefs: { ...s.prefs, fx: 'on', skyMode: 'deco' } })));
});
afterEach(() => vi.restoreAllMocks());

describe('Background', () => {
  it('tạo #bgAura + canvas#bgStars; window.tarotBurst có khi gắn, mất khi gỡ', () => {
    const { container, unmount } = render(<Background />);
    expect(container.querySelector('#bgAura')).not.toBeNull();
    expect(container.querySelector('canvas#bgStars')).not.toBeNull();
    expect(container.firstElementChild?.id).toBe('bgAura');
    expect(typeof (window as W).tarotBurst).toBe('function');
    unmount();
    expect('tarotBurst' in window).toBe(false);
  });

  it('prefs.fx off/on qua store: dừng rồi chạy lại đúng một vòng; gỡ thì không còn rAF/listener', () => {
    const wa = vi.spyOn(window, 'addEventListener');
    const wr = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Background />);
    expect(pending.size).toBe(1);
    act(() => useApp.setState(s => ({ prefs: { ...s.prefs, fx: 'off' } })));
    expect(pending.size).toBe(0);
    act(() => useApp.setState(s => ({ prefs: { ...s.prefs, fx: 'on' } })));
    expect(pending.size).toBe(1);
    unmount();
    expect(pending.size).toBe(0);
    for (const [type, fn] of wa.mock.calls) expect(wr.mock.calls.some(c => c[0] === type && c[1] === fn), type).toBe(true);
  });
});
