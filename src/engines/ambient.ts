// Nhạc nền ambient (tổng hợp trực tiếp, không cần file) — chép từ bản cũ L2252–2378.
// 'mystic' = kalimba tự sinh theo vòng hợp âm; 'candle' = nền trầm + lách tách ngọn nến. Dùng AudioContext chung của audio.ts.
import { getAudioCtx, getNoiseBuf, makeReverb } from './audio';

export type AmbientMode = 'off' | 'mystic' | 'candle';
export interface AmbientEngine {
  setVolume(v: number): void;
  stop(): void;
}

let current: AmbientEngine | null = null; // engine đang chạy: start mới luôn dừng engine cũ (không bao giờ hai scheduler)

// Vòng hợp âm (mỗi hợp âm 2 ô nhịp): Dm7 – Bbmaj7 – Gm7 – C(add9). Nốt rải lấy trong hợp âm + ngũ cung Rê thứ
const PROG = [
  { bass: 50, tones: [62, 65, 69, 72, 74, 77] }, // Dm7:    D4 F4 A4 C5 D5 F5
  { bass: 46, tones: [62, 65, 69, 70, 74, 77] }, // Bbmaj7: D4 F4 A4 Bb4 D5 F5
  { bass: 43, tones: [62, 65, 67, 70, 74, 77] }, // Gm7:    D4 F4 G4 Bb4 D5 F5
  { bass: 48, tones: [60, 64, 67, 69, 72, 74] }, // C(add9→Am): C4 E4 G4 A4 C5 D5
];
const RHYTHMS = [
  // khuôn nhịp (1 = có thể gảy), đổi mỗi câu
  [1, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 1, 0],
  [1, 1, 0, 1, 0, 0, 1, 0],
  [1, 0, 1, 0, 0, 1, 0, 0],
];
const STEPS_JUMP = [-2, -1, -1, 0, 1, 1, 2];
const N = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // số MIDI → Hz

/** Chỉ cho test: quên engine đang chạy (không dừng nó). */
export function resetAmbientForTests(): void {
  current = null;
}

/** Bật nhạc nền. Trả null nếu chưa có AudioContext (chưa ensureAudio) hoặc mode 'off'. */
export function startAmbient(mode: AmbientMode, vol: number): AmbientEngine | null {
  const ctx = getAudioCtx();
  if (!ctx || (mode !== 'mystic' && mode !== 'candle')) return null; // off hoặc mode lạ trong storage: không phát gì
  current?.stop();

  const timers = new Set<ReturnType<typeof setTimeout>>(); // mọi hẹn giờ của engine này, kể cả hẹn dừng node
  const oscs = new Set<AudioScheduledSourceNode>(); // nguồn đã hẹn giờ, chưa kết thúc
  let stopped = false;
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const track = <T extends AudioScheduledSourceNode>(s: T): T => {
    oscs.add(s);
    s.onended = () => oscs.delete(s);
    return s;
  };

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const comp = ctx.createDynamicsCompressor(); // giữ âm lượng đều, không gắt
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.05;
  comp.release.value = 0.6;
  const makeup = ctx.createGain();
  makeup.gain.value = 2.0; // bù sau nén ≈ cùng độ to với bản cũ
  master.connect(comp).connect(makeup).connect(ctx.destination);
  master.gain.setTargetAtTime(vol, ctx.currentTime, 1.5); // fade vào theo âm lượng

  if (mode === 'mystic') {
    // Tiếng vang nối các nốt cho liền mạch; lowpass cho ấm, không chói
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    wet.connect(makeReverb(master));
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    tone.Q.value = 0.3;
    tone.connect(master);
    tone.connect(wet);

    // Nốt gảy: sine gốc + bồi âm nhẹ (bậc 2 & bồi âm lệch của thanh kalimba), bấm nhanh, tắt dần tự nhiên
    const pluck = (midi: number, t: number, vel: number, dec: number, pan: number) => {
      const f = N(midi);
      const p: AudioNode & { pan?: AudioParam } = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (p.pan) p.pan.value = pan || 0;
      p.connect(tone);
      (
        [
          [1, 1, dec],
          [2, 0.18, dec * 0.45],
          [5.95, 0.035, dec * 0.12],
        ] as const
      ).forEach(([r, a, d]) => {
        const o = track(ctx.createOscillator());
        o.type = 'sine';
        o.frequency.value = f * r;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.2 * a * vel), t + (midi < 55 ? 0.03 : 0.014)); // bấm mềm, không "click"
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(p);
        o.start(t);
        o.stop(t + d + 0.05);
      });
    };
    const bell = (midi: number, t: number, vel: number) => {
      // chuông pha lê hiếm hoi, cao, nhiều vang
      const f = N(midi);
      const p = ctx.createGain();
      p.gain.value = 0.5;
      p.connect(wet);
      p.connect(tone);
      (
        [
          [1, 1, 3.0],
          [2.76, 0.25, 1.4],
          [5.4, 0.08, 0.6],
        ] as const
      ).forEach(([r, a, d]) => {
        const o = track(ctx.createOscillator());
        o.type = 'sine';
        o.frequency.value = f * r;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.085 * a * vel), t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(p);
        o.start(t);
        o.stop(t + d + 0.05);
      });
    };

    // Bộ hẹn giờ nhìn trước (lookahead): mỗi 250ms xếp lịch các nốt trong ~1.2s tới theo đồng hồ audio
    const BPM = 66, STEP = 60 / BPM / 2; // nốt móc đơn
    const STEPS_PER_BAR = 8, BARS_PER_CHORD = 2;
    let step = 0, nextT = ctx.currentTime + 0.4, idx = 2;
    let rhythm = RHYTHMS[0] as number[];
    const schedule = () => {
      if (stopped) return;
      while (nextT < ctx.currentTime + 1.2) {
        const bar = Math.floor(step / STEPS_PER_BAR), s = step % STEPS_PER_BAR;
        const ch = PROG[Math.floor(bar / BARS_PER_CHORD) % PROG.length] as (typeof PROG)[number];
        if (s === 0) {
          if (bar % 4 === 0) rhythm = RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)] as number[];
          if (bar % BARS_PER_CHORD === 0) pluck(ch.bass, nextT, 0.38, 2.2, 0); // nốt trầm gảy ngắn, không giữ
        }
        const rest = bar % 8 === 7 && s >= 4; // cuối mỗi 8 ô: nghỉ nửa ô cho "thở"
        if (!rest && rhythm[s] && Math.random() < 0.85) {
          idx = Math.max(0, Math.min(ch.tones.length - 1, idx + (STEPS_JUMP[Math.floor(Math.random() * 7)] as number)));
          const human = (Math.random() - 0.5) * 0.03; // lệch nhịp rất nhẹ như người chơi
          const vel = s === 0 ? 0.95 : 0.6 + Math.random() * 0.3;
          pluck(ch.tones[idx] as number, nextT + human, vel, 1.6 + Math.random() * 0.8, (idx / (ch.tones.length - 1) - 0.5) * 0.7);
        }
        if (s === 4 && bar % 4 === 3 && Math.random() < 0.5) bell((ch.tones[ch.tones.length - 1] as number) + 12, nextT + 0.1, 0.8);
        nextT += STEP;
        step++;
      }
      later(schedule, 250); // một timer duy nhất tại một thời điểm (stop xoá)
    };
    schedule();
  } else {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.connect(master);
    const o = track(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.value = 68; // nền trầm rất nhẹ
    const g = ctx.createGain();
    g.gain.value = 0.12;
    o.connect(g).connect(lp);
    o.start();
    const noiseBuf = getNoiseBuf(); // bộ đệm nhiễu dùng chung của audio.ts
    const crackle = () => {
      // lách tách ngọn nến: burst nhiễu ngắn ngẫu nhiên
      if (stopped) return;
      if (noiseBuf) {
        const t = ctx.currentTime;
        const src = track(ctx.createBufferSource());
        src.buffer = noiseBuf;
        src.playbackRate.value = 0.5 + Math.random();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 500 + Math.random() * 1600;
        bp.Q.value = 1.2;
        const cg = ctx.createGain();
        const d = 0.012 + Math.random() * 0.05;
        cg.gain.setValueAtTime(0.0001, t);
        cg.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.22, t + 0.004);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + d);
        src.connect(bp).connect(cg).connect(master);
        src.start(t, Math.random() * 0.1, d + 0.02);
        src.stop(t + d + 0.05);
      }
      later(crackle, 55 + Math.random() * 420);
    };
    crackle();
  }

  const engine: AmbientEngine = {
    setVolume(v) {
      if (stopped) return;
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.3);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (current === engine) current = null;
      timers.forEach(clearTimeout); // dừng scheduler / lách tách rồi mới hẹn giờ dừng node
      timers.clear();
      try {
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      } catch {
        /* context đã đóng */
      }
      later(() => {
        oscs.forEach(s => {
          try {
            s.stop();
          } catch {
            /* chưa/đã dừng */
          }
        });
        oscs.clear();
        try {
          master.disconnect();
        } catch {
          /* đã ngắt */
        }
      }, 1200);
    },
  };
  current = engine;
  return engine;
}
