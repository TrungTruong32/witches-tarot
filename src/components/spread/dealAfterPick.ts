// Sau khi bốc xong (DRAW_CTX.reading.onPicked của bản cũ L4789, §5.8.3) — dùng chung cho "Bốc bài" và "Trải bài AI":
// 1600 ms sau thu bánh xe, cuộn tới bàn trải → 450 ms sau chia lá. Giảm chuyển động: hai bước chạy với hẹn giờ 0, cuộn tức thì.
import { prefersReducedMotion } from '../../lib/media';
import type { Timers } from '../../lib/timers';

export interface DealAfterPick {
  /** Sổ hẹn giờ của màn (huỷ khi bắt đầu lượt mới / đổi kiểu trải / gỡ màn). */
  timers: Timers;
  /** Lượt bốc còn hiệu lực (live() của DrawStage.onPicked). */
  live: () => boolean;
  /** Ẩn bánh xe (DrawStageHandle.hideFan). */
  hideFan(): void;
  /** Nơi cuộn tới: bàn trải nếu đang hiện, không thì phần dự phòng (danh sách lá / kết quả). */
  scrollTarget(): HTMLElement | null | undefined;
  /** Chia lá (SpreadBoardHandle.deal). */
  deal(): Promise<void> | undefined;
  /** Chia xong (lá cuối đã lật). */
  onDealt(): void;
}

export function dealAfterPick(o: DealAfterPick): void {
  const reduce = prefersReducedMotion();
  o.timers.later(() => {
    if (!o.live()) return;
    o.hideFan();
    o.scrollTarget()?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    o.timers.later(() => {
      if (!o.live()) return;
      void o.deal()?.then(o.onDealt);
    }, reduce ? 0 : 450);
  }, reduce ? 0 : 1600);
}

/** Bàn trải đang hiện thì cuộn tới nó, không thì tới `fallback`. */
export function boardOr(root: HTMLElement | null, boardId: string, fallback: HTMLElement | null): HTMLElement | null {
  const board = root?.querySelector<HTMLElement>('#' + boardId);
  return board && !board.hidden ? board : fallback;
}
