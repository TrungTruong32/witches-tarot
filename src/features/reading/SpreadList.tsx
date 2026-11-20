// Danh sách lá của trải bài (#spreadList, các dòng .spread-item — renderSpread bản cũ L2969).
// reveal 'seq' (renderSpread(true)): ảnh nhỏ úp, lật lần lượt sau 220 + idx·240 ms (0 khi giảm chuyển động).
import { forwardRef, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { CorrChips } from '../../components/CorrChips';
import { posDesc } from '../../core/spreads';
import type { SpreadCard } from '../../core/types';
import { burstAt, haptic } from '../../engines/burst';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';
import { useReading } from './readingStore';

export interface SpreadListProps {
  cards: SpreadCard[];
  spreadKey: string;
  positions: string[] | null;
  /** Lật ảnh nhỏ lần lượt (hand-off từ màn Bốc bài). */
  seq: boolean;
  /** #spreadList.pending: ẩn danh sách trong lúc chia lá vào bàn. */
  pending: boolean;
}

export const SpreadList = forwardRef<HTMLDivElement, SpreadListProps>(function SpreadList({ cards, spreadKey, positions, seq, pending }, ref) {
  const { lang } = useT();
  const en = lang === 'en';
  const setOrientation = useReading(s => s.setOrientation);
  const removeCard = useReading(s => s.removeCard);
  // Ảnh nhỏ đã lật trong lượt 'seq' (theo uid); ngoài 'seq' mọi ảnh đều đã lật.
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set());
  const flipRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    if (!seq) return;
    setShown(new Set());
    const reduce = prefersReducedMotion();
    const flips = cards.filter(c => c.image_url);
    const timers = flips.map((c, idx) =>
      setTimeout(() => {
        setShown(prev => new Set(prev).add(c.uid ?? -1));
        haptic(8);
        burstAt(flipRefs.current.get(c.uid ?? -1), 12);
        if (idx === flips.length - 1) useReading.getState().setReveal('none');
      }, reduce ? 0 : 220 + idx * 240),
    );
    if (!flips.length) useReading.getState().setReveal('none');
    return () => timers.forEach(clearTimeout);
  }, [seq, cards]);

  const onFlip = (c: SpreadCard) => {
    const uid = c.uid ?? -1;
    if (seq && !shown.has(uid)) {
      setShown(prev => new Set(prev).add(uid));
      haptic(8);
      burstAt(flipRefs.current.get(uid), 12);
    } else if (c.image_url) useApp.getState().openLightbox(c.image_url, c.orientation === 'nguoc');
  };

  return (
    <div id="spreadList" className={pending ? 'pending' : undefined} ref={ref}>
      {!cards.length ? (
        <div className="empty-spread">{en ? 'No cards yet — tap “Shuffle & draw” in step 3.' : 'Chưa có lá nào — bấm “Xào & bốc” ở bước 3 để rút bài.'}</div>
      ) : (
        cards.map((c, i) => {
          const uid = c.uid ?? -1;
          const pos = positions && positions[i];
          return (
            <div className="spread-item" key={uid + ':' + i}>
              {c.image_url ? (
                <div
                  className={'spread-flip' + (seq && !shown.has(uid) ? '' : ' revealed')}
                  title={en ? 'Tap to flip / zoom' : 'Bấm để lật / phóng to'}
                  ref={el => {
                    if (el) flipRefs.current.set(uid, el);
                    else flipRefs.current.delete(uid);
                  }}
                  onClick={() => onFlip(c)}
                >
                  <div className="sfi">
                    <div className="sff front"></div>
                    <div className="sff back">
                      <img src={c.image_url} className={c.orientation === 'nguoc' ? 'rev' : ''} alt={c.ten} loading="lazy" />
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="name">
                <strong>
                  {i + 1}. {pos ? <><span className="pos-badge" title={posDesc(spreadKey, i, lang)}>{pos}</span> </> : null}{c.ten}
                </strong>
                <span>{c.bo || ''}</span>
                <CorrChips card={c} />
              </div>
              <div className="orient">
                <button className={'xuoi' + (c.orientation === 'xuoi' ? ' on' : '')} data-o="xuoi" onClick={() => setOrientation(uid, 'xuoi')}>
                  {en ? 'Upright' : 'Xuôi'}
                </button>
                <button className={'nguoc' + (c.orientation === 'nguoc' ? ' on' : '')} data-o="nguoc" onClick={() => setOrientation(uid, 'nguoc')}>
                  {en ? 'Reversed' : 'Ngược'}
                </button>
              </div>
              <button className="rm" title={en ? 'Remove this card' : 'Bỏ lá này'} onClick={() => removeCard(uid)}>✕</button>
            </div>
          );
        })
      )}
    </div>
  );
});
