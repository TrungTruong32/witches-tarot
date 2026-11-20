import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimers } from './timers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTimers', () => {
  it('later() runs once; clear() cancels everything pending and the registry stays usable', () => {
    const t = createTimers();
    const a = vi.fn(), b = vi.fn(), c = vi.fn();
    t.later(a, 10);
    t.later(b, 20);
    vi.advanceTimersByTime(10);
    expect(a).toHaveBeenCalledTimes(1);
    t.clear();
    vi.advanceTimersByTime(100);
    expect(b).not.toHaveBeenCalled();
    t.later(c, 5);
    vi.advanceTimersByTime(5);
    expect(c).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
