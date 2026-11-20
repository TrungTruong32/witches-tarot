// Xào bài kiểu riffle thật (bản cũ L4813–4930): điều khiển bằng Web Animations + hẹn giờ âm thanh trên CÙNG một đồng hồ.
// Luân phiên: vòng chẵn = xoáy bay vòng, vòng lẻ = riffle (chia đôi → uốn cong → thả xen kẽ → cầu → gõ gọn).
import { getAudioCtx, isSfxEnabled, sfx } from './audio';
import { zodiacWheelHTML } from './zodiacWheel';

interface Loop {
  timer: ReturnType<typeof setTimeout> | null;
  raf: number;
  anims: Animation[];
  cycle: number;
}

const cancelAll = (anims: Animation[]) =>
  anims.forEach(a => {
    try {
      a.cancel();
    } catch {
      /* đã huỷ */
    }
  });

/** el = khung xoay (#orbit); thêm bánh xe hoàng đạo + N lá, N = clamp(deckSize, 8, 24). stop() dọn sạch timer/rAF/animation/âm thanh. */
export function startShuffle(el: HTMLElement, deckSize: number): { stop(): void } {
  el.innerHTML = zodiacWheelHTML();
  let stopped = false;
  let showRaf = requestAnimationFrame(() => {
    showRaf = 0;
    const zw = el.querySelector('.zwheel');
    if (zw) zw.classList.add('show');
  });
  const N = Math.max(8, Math.min(deckSize, 24));
  const cards: HTMLElement[] = [];
  for (let i = 0; i < N; i++) {
    const c = document.createElement('div');
    c.className = 'riffle-card';
    c.style.transform = `translateY(${(-i * 0.45).toFixed(2)}px)`;
    c.style.zIndex = String(10 + i);
    el.appendChild(c);
    cards.push(c);
  }
  const loop: Loop = { timer: null, raf: 0, anims: [], cycle: 0 };
  const alive = () => !stopped && el.isConnected;

  // Vòng "xoáy": cả xấp xoay quanh trục dọc, xoắn ra và bay vòng quanh tâm rồi gom lại (~3,4s).
  // Mỗi lá mang perspective() riêng (cùng tâm) và z-index tính theo độ sâu mỗi khung → các lá không cắt xuyên nhau.
  const vortexCycle = (done: () => void) => {
    const D = 3400;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const env = (t: number) => (t < 200 ? 0 : t < 1000 ? ease((t - 200) / 800) : t < 2000 ? 1 : t < 2900 ? 1 - ease((t - 2000) / 900) : 0);
    let R = 0,
      H = 0; // đo ở khung đầu tiên: lúc gọi khung xào có thể chưa hiện → kích thước = 0
    const ac = getAudioCtx();
    if (isSfxEnabled() && ac) {
      const T = ac.currentTime + 0.03;
      sfx.whoosh(T + 0.25, 1.4, 0.8);
      sfx.thump(T + 3.0, 0.9);
    }
    let spin = 0,
      last = performance.now();
    const t0 = last;
    const step = (now: number) => {
      loop.raf = 0;
      if (!alive()) return;
      const t = now - t0,
        dt = Math.min(50, now - last);
      last = now;
      if (!R) {
        R = Math.min(125, el.clientWidth * 0.28);
        H = Math.min(70, el.clientHeight * 0.22);
      }
      const sv = env(t);
      spin += dt * (0.05 + 0.5 * sv);
      if (t > 2900) spin += (Math.round(spin / 360) * 360 - spin) * 0.15; // xoay về mặt trước
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const y = -i * 0.45 + (u - 0.5) * sv * H + sv * 14; // hạ tâm một chút khi toả: lá gần người xem phóng to, tránh chạm mép trên
        const a = spin + sv * i * (360 / N + 14);
        const r = sv * R * (0.75 + 0.25 * Math.sin(i * 1.7));
        const tilt = sv * 9 * Math.sin(spin / 40 + i);
        const c = cards[i]!;
        c.style.transform = `perspective(900px) rotateX(${(-10 * sv).toFixed(1)}deg) translate3d(0, ${y.toFixed(1)}px, 0) rotateY(${a.toFixed(1)}deg) translateZ(${r.toFixed(1)}px) rotateX(${tilt.toFixed(1)}deg)`;
        c.style.zIndex = String(5000 + Math.round(r * Math.cos((a * Math.PI) / 180) * 10) + i);
      }
      if (t < D) {
        loop.raf = requestAnimationFrame(step);
        return;
      }
      cards.forEach((c, i) => {
        c.style.transform = `translateY(${(-i * 0.45).toFixed(2)}px)`;
        c.style.zIndex = String(10 + i);
      });
      done();
    };
    loop.raf = requestAnimationFrame(step);
  };

  const M = Math.ceil(N / 2);
  const run = () => {
    if (!alive()) return;
    // Luân phiên: vòng chẵn = xoáy bay vòng, vòng lẻ = riffle
    if (loop.cycle % 2 === 0) {
      vortexCycle(() => {
        loop.cycle++;
        run();
      });
      return;
    }
    loop.anims = [];
    const D = 1650 + Math.random() * 250; // mỗi vòng dài ngắn khác nhau chút
    const spreadX = Math.min(124, Math.max(72, el.clientWidth * 0.26)); // hai nửa tách rõ cả trên khung hẹp
    const leftFirst = (loop.cycle >> 1) % 2 === 0; // đổi bên thả trước mỗi vòng riffle
    // Thứ tự rơi: xen kẽ từ đáy hai nửa, đôi khi 2 lá cùng bên rơi liền (như tay thật)
    const L: number[] = [],
      Rr: number[] = [];
    for (let i = 0; i < N; i++) (i < M ? L : Rr).push(i);
    const order: number[] = [];
    let a = leftFirst ? L : Rr,
      b = leftFirst ? Rr : L;
    while (a.length || b.length) {
      if (a.length) order.push(a.shift()!);
      if (a.length && Math.random() < 0.18) order.push(a.shift()!);
      [a, b] = [b, a];
    }
    const landAt: number[] = new Array<number>(N),
      landIdx: number[] = new Array<number>(N);
    order.forEach((ci, k) => {
      landAt[ci] = 0.3 + 0.32 * (k / (N - 1));
      landIdx[ci] = k;
    });
    // Âm thanh: hẹn giờ theo đúng các mốc của hình
    const ac = getAudioCtx();
    if (isSfxEnabled() && ac) {
      const T = ac.currentTime + 0.03,
        s = D / 1000;
      for (let i = 0; i < N; i++) sfx.flick(T + landAt[i]! * s, i < M ? -0.5 : 0.5, 0.75 + Math.random() * 0.35);
      sfx.whoosh(T + 0.665 * s, 0.17 * s, 0.9);
      sfx.thump(T + 0.86 * s, 0.9);
    }
    cards.forEach((c, i) => {
      const side = i < M ? -1 : 1,
        j = i < M ? i : i - M; // j: vị trí trong nửa
      const hx = side * (spreadX - j * 1.2),
        hy = -j * 0.6;
      const k = landIdx[i]!,
        t = landAt[i]!;
      const jit = (Math.random() - 0.5) * 5,
        jr = (Math.random() - 0.5) * 3;
      const stack = (y: number) => `translate(0px, ${y.toFixed(1)}px) rotate(0deg)`;
      const f = [
        { offset: 0, transform: stack(-i * 0.45), zIndex: 10 + i },
        { offset: 0.12, transform: `translate(${hx.toFixed(1)}px, ${hy.toFixed(1)}px) rotate(${side * 6}deg)`, zIndex: 50 + j },
        { offset: 0.22, transform: `translate(${(hx - side * 10).toFixed(1)}px, ${(hy - 14).toFixed(1)}px) rotate(${side * 15}deg)`, zIndex: 50 + j },
        { offset: t - 0.035, transform: `translate(${(hx - side * 14).toFixed(1)}px, ${(hy - 16).toFixed(1)}px) rotate(${side * 17}deg)`, zIndex: 50 + j },
        { offset: t, transform: `translate(${(side * 4 + jit).toFixed(1)}px, ${(-k * 0.45).toFixed(1)}px) rotate(${jr.toFixed(1)}deg)`, zIndex: 100 + k },
        { offset: 0.66, transform: `translate(${(jit * 0.6).toFixed(1)}px, ${(-20 - k * 0.45).toFixed(1)}px) rotate(${k % 2 ? 5 : -5}deg)`, zIndex: 100 + k },
        { offset: 0.8, transform: `translate(0px, ${(-k * 0.45).toFixed(1)}px) rotate(${(jr * 0.5).toFixed(1)}deg)`, zIndex: 100 + k },
        { offset: 0.86, transform: `translate(0px, ${(3 - k * 0.45).toFixed(1)}px) rotate(0deg)`, zIndex: 100 + k },
        { offset: 0.92, transform: stack(-k * 0.45), zIndex: 100 + k },
        { offset: 1, transform: stack(-k * 0.45), zIndex: 100 + k },
      ];
      loop.anims.push(c.animate(f, { duration: D, easing: 'linear', fill: 'forwards' }));
    });
    // Cuối vòng: đặt lại thứ tự DOM theo thứ tự đã cài, để vòng sau bắt đầu từ bộ bài mới
    loop.timer = setTimeout(() => {
      loop.timer = null;
      if (stopped) return;
      const sorted = cards
        .map((c, i) => [landIdx[i]!, c] as const)
        .sort((x, y) => x[0] - y[0])
        .map(x => x[1]);
      sorted.forEach((c, i) => {
        cards[i] = c;
        c.style.transform = `translateY(${(-i * 0.45).toFixed(2)}px)`;
        c.style.zIndex = String(10 + i);
      });
      cancelAll(loop.anims);
      loop.cycle++;
      run();
    }, D);
  };
  run();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (loop.timer) clearTimeout(loop.timer);
      loop.timer = null;
      if (loop.raf) cancelAnimationFrame(loop.raf);
      loop.raf = 0;
      if (showRaf) cancelAnimationFrame(showRaf);
      showRaf = 0;
      cancelAll(loop.anims);
      loop.anims = [];
      sfx.stopAll();
    },
  };
}
