import { describe, expect, it, vi } from 'vitest';
import { loadSky, onSkyLoaded, resetForTests } from './skyData';

const DATA = { stars: [[1, 2, 3]], lines: [['And', [[1, 2], [3, 4]]]], names: [[1, 2, 'X']], consts: [[1, 2, 'Andromeda', 'And']] };
const ok = () => ({ ok: true, json: async () => DATA }) as unknown as Response;

describe('loadSky', () => {
  it('shares one in-flight fetch and caches the result', async () => {
    resetForTests();
    const f = vi.fn(async () => ok());
    const [a, b] = await Promise.all([loadSky(f as unknown as typeof fetch), loadSky(f as unknown as typeof fetch)]);
    expect(a).toBe(b);
    await loadSky(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/sky.json');
  });
  it('rejects on failure and retries on the next call', async () => {
    resetForTests();
    const f = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(ok());
    await expect(loadSky(f as unknown as typeof fetch)).rejects.toThrow('net');
    await expect(loadSky(f as unknown as typeof fetch)).resolves.toEqual(DATA);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('onSkyLoaded: notified on a successful load (not on failure); unsubscribe stops it; a throwing listener does not break the load', async () => {
    resetForTests();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = vi.fn(), b = vi.fn(() => { throw new Error('x'); });
    const offA = onSkyLoaded(a);
    onSkyLoaded(b);
    const f = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValue(ok());
    await expect(loadSky(f as unknown as typeof fetch)).rejects.toThrow('net');
    expect(a).not.toHaveBeenCalled();
    await expect(loadSky(f as unknown as typeof fetch)).resolves.toEqual(DATA);
    expect(a).toHaveBeenCalledWith(DATA);
    expect(err).toHaveBeenCalledTimes(1);
    offA();
    resetForTests();   // cũng xoá mọi bên nghe
    await loadSky(f as unknown as typeof fetch);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
  it('rejects on non-ok response', async () => {
    resetForTests();
    const f = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    await expect(loadSky(f as unknown as typeof fetch)).rejects.toThrow();
  });
});
