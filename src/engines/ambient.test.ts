import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureAudio, getAudioCtx, getNoiseBuf, resetForTests } from './audio';
import { resetAmbientForTests, startAmbient } from './ambient';

// AudioContext giả: ghi lại mọi node + lời gọi start/stop/connect
class FakeParam {
  value = 0;
  calls: [string, ...number[]][] = [];
  setValueAtTime(v: number, t: number) { this.calls.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push(['exp', v, t]); return this; }
  setTargetAtTime(v: number, t: number, tc: number) { this.calls.push(['target', v, t, tc]); return this; }
}
class FakeNode {
  kind = '';
  connected: FakeNode[] = [];
  disconnected = false;
  started: number[] = [];
  stopped: (number | undefined)[] = [];
  type = '';
  buffer: unknown = null;
  gain = new FakeParam();
  frequency = new FakeParam();
  pan = new FakeParam();
  playbackRate = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  onended: (() => void) | null = null;
  connect(n: FakeNode) { this.connected.push(n); return n; }
  disconnect() { this.disconnected = true; }
  start(t = 0) { this.started.push(t); }
  stop(t?: number) { this.stopped.push(t); }
}
let all: FakeNode[] = [];
let now = 0;
class FakeCtx {
  state = 'running';
  sampleRate = 100;
  destination = new FakeNode();
  get currentTime() { return now; }
  resume() { return Promise.resolve(); }
  make(kind: string) { const n = new FakeNode(); n.kind = kind; all.push(n); return n; }
  createGain() { return this.make('gain'); }
  createDynamicsCompressor() { return this.make('comp'); }
  createBiquadFilter() { return this.make('biquad'); }
  createOscillator() { return this.make('osc'); }
  createBufferSource() { return this.make('src'); }
  createStereoPanner() { return this.make('pan'); }
  createConvolver() { return this.make('conv'); }
  createBuffer(ch: number, len: number) { return { getChannelData: () => new Float32Array(len), ch }; }
}
const sources = () => all.filter(n => n.kind === 'osc' || n.kind === 'src');

beforeEach(() => {
  vi.useFakeTimers();
  all = [];
  now = 0;
  resetForTests();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  ensureAudio();
  resetAmbientForTests();
  vi.clearAllTimers(); // test trước có thể để lại hẹn giờ
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('startAmbient', () => {
  it('không có AudioContext hoặc mode off → null', () => {
    resetForTests();
    expect(startAmbient('mystic', 0.5)).toBeNull();
    ensureAudio();
    expect(startAmbient('off', 0.5)).toBeNull();
    expect(startAmbient('bogus' as never, 0.5)).toBeNull(); // mode lạ: không phát gì
    expect(vi.getTimerCount()).toBe(0);
  });

  it('đồ thị: master → nén → bù ×2 → destination, fade-in 1.5s', () => {
    startAmbient('mystic', 0.4);
    const master = all.find(n => n.kind === 'gain') as FakeNode;
    expect(master.gain.value).toBe(0.0001);
    expect(master.gain.calls).toContainEqual(['target', 0.4, 0, 1.5]);
    const comp = master.connected[0] as FakeNode;
    expect(comp.kind).toBe('comp');
    expect([comp.threshold.value, comp.ratio.value, comp.attack.value, comp.release.value]).toEqual([-20, 3, 0.05, 0.6]);
    const makeup = comp.connected[0] as FakeNode;
    expect(makeup.gain.value).toBe(2);
    expect(makeup.connected[0]).toBe((getAudioCtx() as unknown as FakeCtx).destination);
  });

  it('mystic: xếp nốt trước ~1.2s, lọc lowpass 2600, rồi tiếp mỗi 250ms; stop dừng mọi oscillator sau 1200ms và hết timer', () => {
    const eng = startAmbient('mystic', 0.5)!;
    const tone = all.find(n => n.kind === 'biquad') as FakeNode;
    expect([tone.type, tone.frequency.value]).toEqual(['lowpass', 2600]);
    const oscs = sources();
    expect(oscs.length).toBeGreaterThan(0);
    expect(Math.max(...oscs.flatMap(o => o.started))).toBeLessThan(1.2 + 0.4 + 0.2);
    expect(vi.getTimerCount()).toBe(1);
    now = 1;
    vi.advanceTimersByTime(250);
    expect(sources().length).toBeGreaterThan(oscs.length);
    eng.stop();
    expect(vi.getTimerCount()).toBe(1); // chỉ còn hẹn giờ dừng node 1200ms
    const master = all.find(n => n.kind === 'gain') as FakeNode;
    expect(master.gain.calls.at(-1)).toEqual(['target', 0.0001, 1, 0.4]);
    vi.advanceTimersByTime(1200);
    expect(vi.getTimerCount()).toBe(0);
    expect(sources().every(o => o.stopped.length > 0)).toBe(true);
    expect(master.disconnected).toBe(true);
  });

  it('candle: nền 68Hz qua lowpass 300, lách tách nhiễu băng thông; stop dọn sạch', () => {
    expect(getNoiseBuf()).not.toBeNull();
    const eng = startAmbient('candle', 0.5)!;
    const lp = all.find(n => n.kind === 'biquad' && n.type === 'lowpass') as FakeNode;
    expect(lp.frequency.value).toBe(300);
    const bed = all.find(n => n.kind === 'osc') as FakeNode;
    expect(bed.frequency.value).toBe(68);
    const before = all.filter(n => n.kind === 'src').length;
    expect(before).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(all.filter(n => n.kind === 'src').length).toBeGreaterThan(before);
    eng.stop();
    vi.advanceTimersByTime(1200);
    expect(vi.getTimerCount()).toBe(0);
    expect(sources().every(o => o.stopped.length > 0)).toBe(true);
  });

  it('setVolume đổi gain của master (setTargetAtTime 0.3)', () => {
    const eng = startAmbient('candle', 0.5)!;
    const master = all.find(n => n.kind === 'gain') as FakeNode;
    now = 2;
    eng.setVolume(0.8);
    expect(master.gain.calls.at(-1)).toEqual(['target', 0.8, 2, 0.3]);
    eng.stop();
    eng.setVolume(0.1); // sau stop: bỏ qua
    expect(master.gain.calls.at(-1)).toEqual(['target', 0.0001, 2, 0.4]);
  });

  it('off→mystic→candle→off liên tiếp: không còn scheduler, mọi nguồn đã dừng', () => {
    const a = startAmbient('mystic', 0.5)!;
    const b = startAmbient('candle', 0.5)!; // tự dừng a
    expect(vi.getTimerCount()).toBe(2); // crackle + hẹn dừng node của a
    b.stop();
    a.stop(); // idempotent
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(sources().every(o => o.stopped.length > 0)).toBe(true);
    const c = startAmbient('mystic', 0.5)!;
    c.stop();
    vi.advanceTimersByTime(1200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hai lần start liên tiếp không để hai scheduler chạy', () => {
    startAmbient('mystic', 0.5);
    startAmbient('mystic', 0.5);
    // 1 scheduler của engine mới + 1 hẹn giờ dừng node của engine cũ
    expect(vi.getTimerCount()).toBe(2);
  });
});
