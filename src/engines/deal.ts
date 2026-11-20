import { createTimers } from '../lib/timers';
import { burstAt, haptic } from './burst';

/**
 * Chia lá (bản cũ L2767): từng lá bay từ phía trên bàn vào đúng vị trí theo thứ tự, đáp xong thì lật.
 * Trả về hàm huỷ: xoá mọi hẹn giờ còn lại (done sẽ không được gọi).
 */
export function dealBoard(board: HTMLElement, reduce: boolean, done: () => void): () => void {
  const cards = [...board.querySelectorAll<HTMLElement>('.board-card.await')];
  if (!cards.length) {
    done();
    return () => {};
  }
  if (reduce || !cards[0]!.animate) {
    cards.forEach(el => el.classList.remove('await', 'revealed'));
    cards.forEach(el => el.classList.add('revealed'));
    done();
    return () => {};
  }
  const timers = createTimers();
  const later = timers.later;
  const anims: Animation[] = [];
  const br = board.getBoundingClientRect();
  const ox = br.left + br.width / 2, oy = br.top - 40;
  const STEP = cards.length > 7 ? 190 : 280, FLY = 560;
  cards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = ox - (r.left + r.width / 2), dy = oy - (r.top + r.height / 2);
    const end = el.classList.contains('cross') ? 'rotate(90deg)' : 'none';
    el.classList.remove('await');
    const an = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${(i % 2 ? 1 : -1) * 14}deg) scale(.55)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: end, opacity: 1 },
      ],
      { duration: FLY, delay: i * STEP, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' },
    );
    anims.push(an);
    later(() => {
      el.classList.add('revealed');
      haptic(8);
      burstAt(el, 10);
    }, i * STEP + FLY + 140);
  });
  later(done, (cards.length - 1) * STEP + FLY + 700);
  return () => {
    timers.clear();
    anims.forEach(a => {
      try {
        a.cancel();
      } catch {
        /* đã huỷ */
      }
    });
  };
}
