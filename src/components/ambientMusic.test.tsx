import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, useApp } from '../app/store';
import * as ambient from '../engines/ambient';
import * as audio from '../engines/audio';
import { AmbientMusic } from './AmbientMusic';

const setPref = (k: 'ambientMode' | 'ambientVol', v: string | number) => act(() => useApp.getState().setPref(k, v as never));
const engines: { setVolume: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; live: boolean }[] = [];
/** Số engine đang chạy lớn nhất từng thấy ngay lúc một engine mới được bật. */
let maxLive = 0;
const liveCount = () => engines.filter(e => e.live).length;

beforeEach(() => {
  localStorage.clear();
  engines.length = 0;
  maxLive = 0;
  vi.spyOn(audio, 'ensureAudio').mockReturnValue({} as AudioContext);
  vi.spyOn(ambient, 'startAmbient').mockImplementation(() => {
    const e = { setVolume: vi.fn(), stop: vi.fn(() => void (e.live = false)), live: true };
    engines.push(e);
    maxLive = Math.max(maxLive, liveCount());
    return e;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('AmbientMusic', () => {
  it('mode bật lúc mở app: chờ cử chỉ đầu tiên, bật đúng một lần, gỡ cả hai listener', () => {
    useApp.setState({ ...initialState() });
    setPref('ambientMode', 'mystic');
    const wr = vi.spyOn(window, 'removeEventListener');
    // gắn sau khi đặt mode → đây là "mở app với mode đã bật"
    const { unmount } = render(<AmbientMusic />);
    expect(ambient.startAmbient).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('pointerdown'));
    expect(ambient.startAmbient).toHaveBeenCalledTimes(1);
    expect(ambient.startAmbient).toHaveBeenCalledWith('mystic', 0.5);
    expect(audio.ensureAudio).toHaveBeenCalled();
    const removed = wr.mock.calls.map(c => c[0]);
    expect(removed).toContain('pointerdown');
    expect(removed).toContain('keydown');
    unmount();
    expect(engines[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('gỡ trước cử chỉ: không bật và không còn listener', () => {
    useApp.setState({ ...initialState() });
    setPref('ambientMode', 'candle');
    const { unmount } = render(<AmbientMusic />);
    unmount();
    window.dispatchEvent(new Event('keydown'));
    expect(ambient.startAmbient).not.toHaveBeenCalled();
  });

  it('đổi mode trong Cài đặt: dừng engine cũ, bật engine mới ngay; off thì dừng hẳn', () => {
    useApp.setState({ ...initialState() });
    render(<AmbientMusic />);
    expect(ambient.startAmbient).not.toHaveBeenCalled();
    setPref('ambientMode', 'mystic');
    expect(ambient.startAmbient).toHaveBeenLastCalledWith('mystic', 0.5);
    setPref('ambientMode', 'candle');
    expect(engines[0]?.stop).toHaveBeenCalledTimes(1);
    expect(ambient.startAmbient).toHaveBeenLastCalledWith('candle', 0.5);
    setPref('ambientMode', 'off');
    expect(engines[1]?.stop).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(2);
  });

  it('đổi âm lượng gọi setVolume, không khởi động lại', () => {
    useApp.setState({ ...initialState() });
    render(<AmbientMusic />);
    setPref('ambientMode', 'mystic');
    setPref('ambientVol', 0.8);
    expect(engines[0]?.setVolume).toHaveBeenLastCalledWith(0.8);
    expect(engines).toHaveLength(1);
  });

  it('StrictMode: mode bật lúc mở app + một cử chỉ → đúng một engine, không bật đôi', () => {
    useApp.setState({ ...initialState() });
    setPref('ambientMode', 'mystic');
    render(
      <StrictMode>
        <AmbientMusic />
      </StrictMode>,
    );
    expect(ambient.startAmbient).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(ambient.startAmbient).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(1);
    expect(engines[0]?.stop).not.toHaveBeenCalled();
  });

  it.each([false, true])('không bao giờ hai engine cùng chạy: cử chỉ + đổi mode liên tiếp (StrictMode: %s)', strict => {
    useApp.setState({ ...initialState() });
    setPref('ambientMode', 'mystic');
    const { unmount } = render(strict ? <StrictMode><AmbientMusic /></StrictMode> : <AmbientMusic />);
    window.dispatchEvent(new Event('pointerdown'));
    for (const m of ['candle', 'mystic', 'off', 'candle', 'candle', 'mystic']) setPref('ambientMode', m);
    window.dispatchEvent(new Event('keydown'));   // listener cử chỉ đã gỡ: không bật thêm
    expect(engines.length).toBe(5);   // mystic, candle, mystic, candle, mystic ('candle' lặp lại không đổi gì)
    expect(maxLive).toBe(1);          // mỗi lần bật, engine cũ đã dừng
    expect(liveCount()).toBe(1);
    unmount();
    expect(liveCount()).toBe(0);
    expect(engines.every(e => e.stop.mock.calls.length >= 1)).toBe(true);
  });
});
