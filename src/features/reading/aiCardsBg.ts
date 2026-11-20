// Nền "lá bài trôi" sau khung diễn giải AI (#aiCardsBg, L3702–3770): các lá của trải bài trôi mờ phía sau câu trả lời.
// 'thinking' = AI đang đọc → trôi nhanh hơn, lần lượt từng lá sáng lên; 'done' = trôi chậm, rất mờ.
// Engine thuần DOM (WAAPI) gắn vào một phần tử; React chỉ gọi mode()/stop(). Ảnh gắn qua thuộc tính src, không qua innerHTML
// (lá từ link chia sẻ là dữ liệu không tin được).
import type { SpreadCard } from '../../core/types';

const MAX_CARDS = 12;

/** Khoá của trải bài: đổi lá / đổi chiều → dựng lại nền; giữ nguyên thì chỉ đổi chế độ (không giật). */
export function aiBgKey(cards: Pick<SpreadCard, 'id' | 'ten' | 'orientation'>[]): string {
  return cards.map(c => (c.id != null ? c.id : c.ten) + (c.orientation === 'nguoc' ? 'r' : '')).join('|');
}

export interface AiCardsBg {
  mode(m: 'thinking' | 'done'): void;
  /** Huỷ hoạt ảnh + hẹn giờ, xoá các lá, trả hộp về lớp gốc. */
  stop(): void;
}

export function startAiCardsBg(box: HTMLElement, cards: SpreadCard[], reduce: boolean, rnd: () => number = Math.random): AiCardsBg {
  const list = cards.slice(0, MAX_CARDS);
  const n = list.length;
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const els: HTMLElement[] = [];
  const anims: Animation[] = [];
  let litTimer: ReturnType<typeof setInterval> | null = null;
  let lit = -1;

  box.replaceChildren();
  list.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'aibg-card';
    // rải đều theo chiều ngang, so le lên xuống; nhiều lá thì nhỏ lại chút
    el.style.left = ((i + 0.5) / n * 84 + 8).toFixed(1) + '%';
    el.style.top = (i % 2 ? between(34, 58) : between(6, 28)).toFixed(1) + '%';
    if (n > 6) el.style.setProperty('--w', '78px');
    if (c.image_url) {
      const img = document.createElement('img');
      img.src = c.image_url;
      img.className = c.orientation === 'nguoc' ? 'rev' : '';
      img.alt = '';
      img.setAttribute('loading', 'eager');
      img.setAttribute('decoding', 'async');
      el.appendChild(img);
    }
    box.appendChild(el);
    els.push(el);
    const r0 = between(-12, 12);
    if (reduce || typeof el.animate !== 'function') {
      el.style.transform = `rotate(${r0}deg)`;
      return;
    }
    const dx = between(-46, 46), dy = between(-40, 40), r1 = r0 + between(-10, 10);
    anims.push(el.animate([
      { transform: `translate(0px, 0px) rotate(${r0}deg)` },
      { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${r1.toFixed(1)}deg)` },
      { transform: `translate(${(-dx * 0.6).toFixed(1)}px, ${(dy * 0.5).toFixed(1)}px) rotate(${(r0 - (r1 - r0) * 0.5).toFixed(1)}deg)` },
    ], { duration: between(16000, 26000), iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -between(0, 16000) }));
  });

  const stopLit = () => {
    if (litTimer) clearInterval(litTimer);
    litTimer = null;
  };

  return {
    mode(m) {
      const thinking = m === 'thinking';
      box.classList.add('on');
      box.classList.toggle('thinking', thinking);
      box.classList.toggle('done', !thinking);
      anims.forEach(a => { a.playbackRate = thinking ? 2.4 : 1; });
      stopLit();
      els.forEach(el => el.classList.remove('lit'));
      if (!thinking || !els.length) return;
      // AI "đọc" lần lượt từng lá: lá đang được đọc sáng lên rồi chuyển sang lá kế
      const step = () => {
        els[lit]?.classList.remove('lit');
        lit = (lit + 1) % els.length;
        els[lit]?.classList.add('lit');
      };
      step();
      litTimer = setInterval(step, reduce ? 2600 : 1500);
    },
    stop() {
      stopLit();
      anims.forEach(a => {
        try { a.cancel(); } catch { /* đã huỷ */ }
      });
      anims.length = 0;
      box.replaceChildren();
      box.className = 'ai-cards-bg';
    },
  };
}
