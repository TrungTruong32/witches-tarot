// Âm thanh lá bài (Web Audio, tổng hợp tại chỗ, không cần file) — chép từ bản cũ L4595–4757.
// Một AudioContext dùng chung (Plan 2c nhạc nền dùng lại qua getAudioCtx). Mọi hàm sfx là no-op khi tắt tiếng hoặc chưa ensureAudio().

let soundOn = true;
let soundVol = 0.7;
let audioCtx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let noiseLong: AudioBuffer | null = null;
let reverbNode: ConvolverNode | null = null;
let reverbCtx: AudioContext | null = null;
let fxSources: AudioScheduledSourceNode[] = []; // nguồn đã hẹn giờ của lượt xào hiện tại (để dừng ngay)

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Chỉ cho test: đưa trạng thái module về ban đầu (AudioContext, bộ đệm, âm lượng). */
export function resetForTests(): void {
  audioCtx = noiseBuf = noiseLong = reverbNode = reverbCtx = null;
  fxSources = [];
  soundOn = true;
  soundVol = 0.7;
}

export function getAudioCtx(): AudioContext | null {
  return audioCtx;
}

/** Bộ đệm nhiễu trắng dùng chung (null trước ensureAudio) — nhạc nền "nến" dùng lại, không tạo bộ thứ hai. */
export function getNoiseBuf(): AudioBuffer | null {
  return noiseBuf;
}

/** Tạo (lười) và đánh thức AudioContext; gọi từ một cử chỉ người dùng. */
export function ensureAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
      if (Ctor) audioCtx = new Ctor();
    }
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    if (audioCtx && !noiseBuf) {
      // Bộ đệm nhiễu trắng dùng lại cho mọi tiếng cọ bài
      const len = Math.floor(audioCtx.sampleRate * 0.2);
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch {
    /* trình duyệt không cho phép: im lặng */
  }
  return audioCtx;
}

/** Thay soundOn/soundVol của bản cũ; store prefs gọi hàm này. */
export function setSfxEnabled(on: boolean, vol: number): void {
  soundOn = on;
  soundVol = Math.min(1, Math.max(0, vol));
  if (!on) stopAll();
}

export function isSfxEnabled(): boolean {
  return soundOn;
}

function longNoise(ctx: AudioContext): AudioBuffer {
  // 2 giây nhiễu hồng nhẹ (êm hơn nhiễu trắng) cho tiếng gió / tiếng "phựt"
  if (noiseLong && noiseLong.sampleRate === ctx.sampleRate) return noiseLong;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  noiseLong = buf;
  return buf;
}

// Tiếng vang phòng (impulse response tự sinh: nhiễu stereo tắt dần, tối dần)
export function makeReverb(dest: AudioNode): ConvolverNode {
  const ctx = audioCtx as AudioContext; // bộ vang mới, đầu ra nối vào dest (vd. master nhạc nền); cần ensureAudio() trước
  const sr = ctx.sampleRate, len = Math.floor(sr * 3.2);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 3.2);
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - (0.4 * i) / len); // càng về sau càng tối
      d[i] = lp * env;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  conv.connect(out).connect(dest);
  return conv;
}
function reverbBus(ctx: AudioContext): ConvolverNode {
  if (reverbNode && reverbCtx === ctx) return reverbNode;
  reverbNode = makeReverb(ctx.destination);
  reverbCtx = ctx;
  return reverbNode;
}

// Đầu ra cho tiếng xào: khô + chút vang, có panning trái/phải
function fxOut(ctx: AudioContext, t: number, pan: number, wet: number): AudioNode {
  const p: AudioNode & { pan?: AudioParam } = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (p.pan) p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan || 0)), t);
  p.connect(ctx.destination);
  if (wet) {
    const s = ctx.createGain();
    s.gain.value = wet;
    p.connect(s).connect(reverbBus(ctx));
  }
  return p;
}

function track<T extends AudioScheduledSourceNode>(src: T): T {
  fxSources.push(src);
  src.onended = () => {
    const i = fxSources.indexOf(src);
    if (i >= 0) fxSources.splice(i, 1);
  };
  return src;
}

// Một lá bài bật khỏi ngón tay: tiếng giấy sắc (bandpass cao) + chút thân (thấp) — rất ngắn
function cardFlick(t: number, pan: number, vol: number): void {
  const ctx = audioCtx;
  if (!soundOn || !ctx || !noiseBuf) return;
  vol = (vol == null ? 1 : vol) * soundVol;
  const out = fxOut(ctx, t, pan, 0.12);
  const src = track(ctx.createBufferSource());
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.5;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600 + Math.random() * 2400;
  bp.Q.value = 0.9;
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 900;
  const g = ctx.createGain(), gb = ctx.createGain();
  const dur = 0.012 + Math.random() * 0.012;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.11 * vol), t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  gb.gain.setValueAtTime(0.0001, t);
  gb.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.05 * vol), t + 0.002);
  gb.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
  src.connect(bp).connect(g).connect(out);
  src.connect(body).connect(gb).connect(out);
  src.start(t, Math.random() * 0.15, dur + 0.02);
  src.stop(t + dur + 0.03);
}

// Tiếng "phựt" khi làm cầu (bridge): bó lá thả xuống rào rạt — nhiễu quét dải + rung nhanh
function cardWhoosh(t: number, dur: number, vol: number): void {
  const ctx = audioCtx;
  if (!soundOn || !ctx) return;
  vol = (vol == null ? 1 : vol) * soundVol;
  const out = fxOut(ctx, t, 0, 0.25);
  const src = track(ctx.createBufferSource());
  src.buffer = longNoise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(900, t);
  bp.frequency.exponentialRampToValueAtTime(3800, t + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.16 * vol), t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const flutter = ctx.createGain();
  flutter.gain.value = 0.6; // rung ~38Hz = các lá lật phành phạch
  const lfo = track(ctx.createOscillator());
  lfo.type = 'square';
  lfo.frequency.value = 34 + Math.random() * 10;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.4;
  lfo.connect(lfoG).connect(flutter.gain);
  src.connect(bp).connect(flutter).connect(g).connect(out);
  src.start(t, Math.random() * 0.8, dur + 0.05);
  src.stop(t + dur + 0.05);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

// Tiếng "cộp" gõ bộ bài cho ngay ngắn: trầm, mềm
function cardThump(t: number, vol: number): void {
  const ctx = audioCtx;
  if (!soundOn || !ctx || !noiseBuf) return;
  vol = (vol == null ? 1 : vol) * soundVol;
  const out = fxOut(ctx, t, 0, 0.2);
  const src = track(ctx.createBufferSource());
  src.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.5 * vol), t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  src.connect(lp).connect(g).connect(out);
  src.start(t, 0, 0.1);
  src.stop(t + 0.1);
  const o = track(ctx.createOscillator());
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.07);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.22 * vol), t + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.1);
}

// Tiếng chuông nhỏ lấp lánh khi một lá được lật (ngũ cung Rê thứ, bồi âm như chuông, nhiều vang)
const REVEAL_NOTES = [587.33, 698.46, 783.99, 880.0, 1046.5];
function revealChime(t: number, idx: number, vol: number): void {
  const ctx = audioCtx;
  if (!soundOn || !ctx) return;
  vol = (vol == null ? 1 : vol) * soundVol;
  const i = idx || 0;
  const f = REVEAL_NOTES[i % REVEAL_NOTES.length] as number;
  const out = fxOut(ctx, t, ((i % 3) - 1) * 0.35, 0.6);
  (
    [
      [1, 1, 2.2],
      [2.0, 0.3, 1.2],
      [2.76, 0.18, 0.9],
      [5.4, 0.06, 0.4],
    ] as const
  ).forEach(([r, a, dec]) => {
    const o = track(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.value = f * r;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.07 * a * vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dec + 0.05);
  });
}

// Tràng "rrrrt" khi hai nửa cài vào nhau: n lá, nhanh dần ở giữa, xen kẽ trái/phải
function riffleBurr(t: number, dur: number, n: number, vol: number): void {
  for (let k = 0; k < n; k++) {
    const u = k / Math.max(1, n - 1);
    const at = t + dur * (u - (Math.sin(2 * Math.PI * u) / (2 * Math.PI)) * 0.6); // dày ở giữa, thưa ở hai đầu
    cardFlick(at, (k % 2 ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.2, (vol || 1) * (0.7 + 0.3 * Math.sin(Math.PI * u)));
  }
}

function stopAll(): void {
  fxSources.slice().forEach(s => {
    try {
      s.stop(0);
    } catch {
      /* đã dừng */
    }
  });
  fxSources = [];
}

export const sfx = {
  flick: cardFlick,
  whoosh: cardWhoosh,
  thump: cardThump,
  chime: revealChime,
  /** Một tiếng "tạch" đơn (chạm lá, nút…) */
  tick(): void {
    if (audioCtx) cardFlick(audioCtx.currentTime + 0.005, (Math.random() - 0.5) * 0.6, 0.9);
  },
  /** Tràng xào ngắn (dùng cho "Xào lại" trên bánh xe bài) */
  startTicks(dur?: number): void {
    sfx.stopTicks();
    if (!soundOn) return;
    ensureAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime + 0.02, d = (dur || 1100) / 1000;
    riffleBurr(t, d * 0.75, 26, 0.9);
    cardThump(t + d * 0.85, 0.8);
  },
  stopTicks(): void {
    stopAll();
  },
  stopAll,
};
