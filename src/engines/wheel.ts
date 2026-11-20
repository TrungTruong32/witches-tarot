// Bánh xe bài úp: người dùng chạm để chọn N lá (manual) hoặc "bàn tay vô hình" tự rút (auto). Bản cũ L5353–5478 (startManualPick).
// Mọi setTimeout/rAF đăng ký vào một tập; cancel() xoá hết → không còn timer mồ côi (thay cho live()/session của bản cũ).
import { escapeHtml } from '../core/markdown';
import type { SpreadCard } from '../core/types';
import type { Lang } from '../core/types';
import { getAudioCtx, sfx } from './audio';
import { burstAt, haptic } from './burst';
import { zodiacWheelHTML } from './zodiacWheel';

export interface WheelOpts {
  pool: SpreadCard[];
  n: number;
  auto: boolean;
  lang: Lang;
  /** prefers-reduced-motion: mọi độ trễ = 0 (do caller truyền vào, engine không đọc matchMedia). */
  reduce: boolean;
  onStatus(text: string): void;
  /** Gọi với các lá đã chọn theo thứ tự chọn. Câu trạng thái cuối (doneMsg) do caller đặt. */
  onDone(cards: SpreadCard[]): void;
  /** Bộ bài mới cho nút "Xào lại". */
  reshufflePool(): SpreadCard[];
}

export function startWheel(fan: HTMLElement, o: WheelOpts): { cancel(): void } {
  let pool = o.pool;
  if (!pool.length) return { cancel() {} };
  const { auto, reduce } = o;
  const en = o.lang === 'en';
  const n = Math.min(o.n, pool.length);
  const N = pool.length;
  const picks: { card: SpreadCard; el: HTMLElement }[] = [];

  let dead = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const rafs = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (!dead) fn();
    }, ms);
    timeouts.add(id);
  };
  // Giảm chuyển động: bước trong finishPick chạy ngay (không hẹn giờ 0 lồng nhau) → onDone trong cùng lượt xử lý.
  const at = (fn: () => void, ms: number) => (reduce ? fn() : later(fn, ms));
  const frame = (fn: () => void) => {
    const id = requestAnimationFrame(() => {
      rafs.delete(id);
      if (!dead) fn();
    });
    rafs.add(id);
  };

  fan.className = 'fan';
  fan.innerHTML =
    zodiacWheelHTML() +
    (auto ? '' : '<div class="fan-tools"><button type="button" class="fan-reshuffle">☍︎ ' + (en ? 'Reshuffle' : 'Xào lại') + '</button></div>');
  fan.style.display = 'block';

  const setStatus = () => {
    const k = picks.length;
    o.onStatus(
      auto
        ? en
          ? '✦ The cards are choosing themselves… (' + k + '/' + n + ')'
          : '✦ Các lá bài đang tự tìm đến bạn… (' + k + '/' + n + ')'
        : en
          ? 'Tap to draw ' + n + ' card' + (n > 1 ? 's' : '') + ' from the wheel (' + k + '/' + n + ').'
          : 'Chạm để bốc ' + n + ' lá từ bánh xe bài (' + k + '/' + n + ').',
    );
  };
  setStatus();

  const backImg = (c: SpreadCard | undefined) =>
    c && c.image_url ? '<img src="' + escapeHtml(c.image_url) + '" class="' + (c.orientation === 'nguoc' ? 'rev' : '') + '" alt="" loading="lazy" />' : '';
  const cards = pool.map(card => {
    const fc = document.createElement('div');
    fc.className = 'wcard';
    fc.innerHTML = '<div class="wbody"><div class="flip"><div class="flip-inner"><div class="flip-face flip-front"></div><div class="flip-face flip-back">' + backImg(card) + '</div></div></div></div>';
    fan.appendChild(fc);
    return fc;
  });

  // Hình học: trục quay nằm dưới khung một đoạn R; góc xòe vừa khít bề rộng thực tế
  const cs = getComputedStyle(fan);
  const cw = parseFloat(cs.getPropertyValue('--cw')) || 70;
  const W = fan.clientWidth || 320;
  const R = Math.max(parseFloat(cs.getPropertyValue('--R')) || 600, W * 0.95);
  fan.style.setProperty('--R', R + 'px');
  const half = Math.max(40, W / 2 - cw / 2 - 8);
  const maxA = (Math.asin(Math.min(0.95, half / (R + 26))) * 180) / Math.PI; // nửa góc xòe (độ)

  const finishPick = () => {
    fan.classList.add('locked');
    // Vị trí cuối: các lá được chọn dàn đều quanh tâm; 1 lá thì phóng to ở giữa
    const H = fan.clientHeight;
    const ch = (cw * 525) / 300;
    const k = picks.length;
    const fs = k === 1 ? 1.35 : Math.min(1.1, Math.max(0.55, (W - 24) / (k * cw * 1.12)));
    const stepA = (Math.asin(Math.min(0.9, (cw * fs * 1.1) / (R + 26))) * 180) / Math.PI;
    const fy = -(H - 26 - ch - (H - ch) / 2); // đưa tâm lá về giữa khung
    picks.forEach((p, j) => {
      p.el.style.setProperty('--fa', ((j - (k - 1) / 2) * stepA).toFixed(3) + 'deg');
      p.el.style.setProperty('--fy', fy.toFixed(1) + 'px');
      p.el.style.setProperty('--fs', fs.toFixed(3));
      p.el.style.zIndex = String(160 + j);
    });
    const wait = reduce ? 0 : 700;
    at(() => fan.classList.add('chosen'), wait);
    const flipAt = reduce ? 0 : wait + 1500;
    picks.forEach((p, j) =>
      at(
        () => {
          p.el.querySelector('.flip')!.classList.add('revealed');
          haptic(8);
          const ac = getAudioCtx();
          if (ac) sfx.chime(ac.currentTime + 0.25, j, k === 1 ? 1.2 : 0.9);
          at(() => burstAt(p.el, k === 1 ? 26 : 14), reduce ? 0 : 700);
        },
        flipAt + (reduce ? 0 : j * 380),
      ),
    );
    at(() => o.onDone(picks.map(p => p.card)), flipAt + (reduce ? 0 : k * 380 + 1300));
  };

  const onPick = (fc: HTMLElement, i: number, fromAuto?: boolean) => {
    if (auto && !fromAuto) return; // chế độ tự động: bỏ qua chạm của người dùng
    if (dead || !fan.classList.contains('spread') || fan.classList.contains('locked') || fan.classList.contains('reshuffle') || fc.classList.contains('picked') || picks.length >= n) return;
    haptic(14);
    const ac = getAudioCtx();
    if (ac) sfx.flick(ac.currentTime + 0.01, (i / Math.max(1, N - 1) - 0.5) * 1.4, 1.1); // tiếng rút lá, trái/phải theo vị trí
    fc.classList.add('picked');
    const im = fc.querySelector<HTMLImageElement>('.flip-back img');
    if (im) {
      im.loading = 'eager';
      im.decoding = 'async'; // tải ảnh ngay, kịp lúc lật
    }
    picks.push({ card: pool[i]!, el: fc });
    setStatus();
    if (picks.length >= n) finishPick();
  };

  cards.forEach((fc, i) => {
    const t = N > 1 ? i / (N - 1) - 0.5 : 0; // -0.5..0.5
    fc.style.setProperty('--a', (t * 2 * maxA).toFixed(3) + 'deg');
    fc.style.setProperty('--d', ((i / N) * 1.1).toFixed(3) + 's'); // lá sau đến muộn hơn → bánh xe "lăn" ra
    fc.style.zIndex = String(10 + i);
    fc.addEventListener('click', () => onPick(fc, i));
  });

  // Tự động: đợi bánh xe lăn ra xong, rồi lần lượt rút n lá ở các vị trí ngẫu nhiên rải đều khắp bánh xe
  if (auto) {
    const idx: number[] = [],
      seg = N / n;
    for (let j = 0; j < n; j++) idx.push(Math.min(N - 1, Math.floor(j * seg + Math.random() * seg)));
    for (let j = idx.length - 1; j > 0; j--) {
      const r = Math.floor(Math.random() * (j + 1));
      [idx[j], idx[r]] = [idx[r]!, idx[j]!]; // thứ tự rút ngẫu nhiên
    }
    const startAt = reduce ? 0 : 1700,
      gap = reduce ? 0 : n > 6 ? 300 : 460;
    idx.forEach((i, j) =>
      later(() => {
        if (fan.isConnected && fan.style.display !== 'none') onPick(cards[i]!, i, true);
      }, startAt + j * gap),
    );
  }

  // Xào lại: quét cả bánh xe sang một bên, đổi thứ tự, rồi xòe lại
  if (!auto) {
    fan.querySelector('.fan-reshuffle')!.addEventListener('click', () => {
      if (dead || picks.length || fan.classList.contains('reshuffle')) return;
      haptic(10);
      sfx.startTicks();
      fan.classList.add('reshuffle');
      later(() => {
        const next = o.reshufflePool();
        pool = pool.map((c, i) => next[i] ?? c); // bộ mới ngắn hơn N: giữ lá cũ
        cards.forEach((fc, i) => {
          fc.querySelector('.flip-back')!.innerHTML = backImg(pool[i]);
        });
        fan.classList.remove('reshuffle');
        later(() => sfx.stopTicks(), 700);
      }, reduce ? 0 : 1100);
    });
  }

  // xòe bánh xe (sau khi đã render + đo kích thước). Giảm chuyển động: xòe ngay để auto-pick (độ trễ 0) không bị bỏ qua.
  const spread = () => {
    fan.querySelector('.zwheel')?.classList.add('show');
    fan.classList.add('spread');
  };
  if (reduce) spread();
  else frame(() => frame(spread));

  return {
    cancel() {
      if (dead) return;
      dead = true;
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      rafs.forEach(cancelAnimationFrame);
      rafs.clear();
      sfx.stopTicks(); // stopAll là toàn cục: cũng dừng mọi nguồn sfx khác đang chạy (chỉ một lượt bốc tại một thời điểm)
    },
  };
}
