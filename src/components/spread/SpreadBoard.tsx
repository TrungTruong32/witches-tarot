// Bàn trải: ô trống đánh số theo vị trí + lá đã rút đặt đúng chỗ (bản cũ L2733–2765). mode 'deal' = lá ẩn, chờ deal() chia vào.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type CSSProperties, type MouseEvent } from 'react';
import { useApp } from '../../app/store';
import { SPREAD_LAYOUT } from '../../core/spreads';
import { boardWidth, freeLayout, layoutGeom } from '../../core/spreadUi';
import type { SpreadCard } from '../../core/types';
import { burstAt, haptic } from '../../engines/burst';
import { dealBoard } from '../../engines/deal';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';

export interface SpreadBoardHandle {
  /** Chia lá vào bàn; xong khi lá cuối đã lật. Gọi lại hoặc gỡ component sẽ huỷ lượt đang chạy (promise cũ không resolve). */
  deal(): Promise<void>;
}

export interface SpreadBoardProps {
  spreadKey: string;
  cards: SpreadCard[];
  positions: string[] | null;
  mode: 'deal' | 'shown';
  id?: string;
}

export const SpreadBoard = forwardRef<SpreadBoardHandle, SpreadBoardProps>(function SpreadBoard(
  { spreadKey, cards, positions, mode, id = 'spreadBoard' },
  ref,
) {
  const { pick } = useT();
  const boardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Lớp .await/.revealed do engine (dealBoard) và thao tác bấm đổi thẳng trên DOM, như bản cũ.
  // React không ghi đè: chuỗi className của mỗi lá chỉ phụ thuộc `mode` nên không đổi giữa các lần render
  // (React chỉ ghi DOM khi prop đổi). Khi `cards` hoặc `mode` đổi, `gen` tăng → key đổi → các lá được
  // gắn lại với lớp khởi tạo mới, đúng như renderBoard của bản cũ dựng lại toàn bộ.
  const genRef = useRef({ cards, mode, gen: 0 });
  if (genRef.current.cards !== cards || genRef.current.mode !== mode) {
    genRef.current = { cards, mode, gen: genRef.current.gen + 1 };
  }
  const gen = genRef.current.gen;

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);
  // Đổi bộ lá / chế độ hoặc gỡ component: huỷ lượt chia đang chạy (phần tử cũ sắp bị gỡ).
  useEffect(() => cancel, [cards, mode, cancel]);

  useImperativeHandle(ref, () => ({
    deal: () =>
      new Promise<void>(resolve => {
        const board = boardRef.current;
        cancel();
        if (!board) return resolve();
        cancelRef.current = dealBoard(board, prefersReducedMotion(), () => {
          cancelRef.current = null;
          resolve();
        });
      }),
  }), [cancel]);

  const lay = SPREAD_LAYOUT[spreadKey];
  const n = lay ? lay.length : cards.length;
  if (!n) return <div id={id} className="spread-board" ref={boardRef} hidden />;
  const g = layoutGeom(lay || freeLayout(n));
  const style = { '--ar': g.ar, '--bw': boardWidth(g) } as CSSProperties;

  const onCard = (e: MouseEvent<HTMLElement>, c: SpreadCard) => {
    const el = e.currentTarget;
    if (!el.classList.contains('revealed')) {
      el.classList.add('revealed');
      haptic(8);
      burstAt(el, 12);
    } else if (c.image_url) useApp.getState().openLightbox(c.image_url, c.orientation === 'nguoc');
  };

  return (
    <div id={id} className="spread-board" ref={boardRef} style={style}>
      {lay && g.items.map((it, i) => {
        const pos = positions && positions[i] ? positions[i] : '';
        return (
          <div
            key={`s${i}`}
            className={`board-slot${it.r ? ' cross' : ''}`}
            style={{ left: it.left, top: it.top, width: it.width, height: it.height }}
            title={pos}
          >
            <b>{i + 1}</b>
            {g.W > 6 ? null : <span>{pos}</span>}
          </div>
        );
      })}
      {cards.map((c, i) => {
        const it = g.items[i];
        if (!it) return null;
        const pos = positions && positions[i] ? positions[i] + ' — ' : '';
        return (
          <div
            key={`${gen}-${i}`}
            className={`spread-flip board-card${it.r ? ' cross' : ''}${mode === 'deal' ? ' await' : ' revealed'}`}
            data-i={i}
            style={{ left: it.left, top: it.top, width: it.width }}
            title={pos + c.ten + (c.orientation === 'nguoc' ? pick({ vi: ' (ngược)', en: ' (reversed)' }) : '')}
            onClick={e => onCard(e, c)}
          >
            <span className="num">{i + 1}</span>
            <div className="sfi">
              <div className="sff front" />
              <div className="sff back">
                {c.image_url
                  ? <img src={c.image_url} className={c.orientation === 'nguoc' ? 'rev' : ''} alt={c.ten} />
                  : <span className="sff-name">{c.ten}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
