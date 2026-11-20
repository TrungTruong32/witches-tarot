// Sân khấu bốc bài DÙNG CHUNG cho "Bốc bài" (ctx 'draw') và "Trải bài AI" (ctx 'reading') — thay DRAW_CTX của bản cũ (L4759–4808).
// Luồng như bản cũ beginDraw → startOrbit → stopOrbit → startManualPick: nghi thức (nếu bật) → xào riffle → Dừng → bánh xe
// (🎲 tự rút / ✋ tự chọn) → onPicked. Chỉ một lượt bốc tại một thời điểm trên cả hai màn (drawSession).
// Khung xoay / bánh xe / dòng trạng thái do engine điều khiển trực tiếp trên DOM (React chỉ dựng div rỗng, không ghi đè).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { drawRandomCards } from '../../core/draw';
import type { SpreadCard } from '../../core/types';
import { ensureAudio } from '../../engines/audio';
import { startShuffle } from '../../engines/shuffle';
import { startWheel } from '../../engines/wheel';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';
import { claimDraw, isLive, releaseDraw } from './drawSession';

export type DrawCtx = 'draw' | 'reading';

export interface DrawStageHandle {
  /** Ẩn bánh xe (sau khi bốc xong, trước khi cuộn tới bàn trải). */
  hideFan(): void;
  /** Huỷ lượt đang dở (xào / bánh xe / nghi thức do màn này mở), ẩn bánh xe + dòng trạng thái. onPicked sẽ không được gọi. */
  cancel(): void;
}

export interface DrawStageProps {
  ctx: DrawCtx;
  /** Số lá cần bốc — đọc lúc bánh xe bắt đầu (sau khi bấm Dừng), như count() của bản cũ. */
  count: number;
  /** Câu hỏi trích trong màn nghi thức. */
  question: string;
  /** Gọi khi một lượt bốc bắt đầu (sau nghi thức). */
  onStart(): void;
  /** Bốc xong. `live()` = lượt này vẫn còn hiệu lực (chưa có lượt bốc mới / chưa gỡ) — dùng cho hẹn giờ của caller. */
  onPicked(cards: SpreadCard[], live: () => boolean): void;
  /** Câu trạng thái sau khi bốc xong k lá. */
  doneMsg(k: number): string;
  /** Phần tử thêm trong cùng hàng nút, trước nút bốc (ô số lá). */
  leading?: ReactNode;
  /** Phần tử thêm sau nút Dừng (nút âm thanh, "Đưa sang Trải bài AI"). */
  trailing?: ReactNode;
}

const IDS = {
  draw: { row: 'draw-controls', auto: 'drawBtn', pick: 'pickBtn', stop: 'stopShuffle', orbit: 'drawOrbit', status: 'pickStatus', fan: 'drawFan' },
  reading: { row: 'draw-row', auto: 'spreadDrawBtn', pick: 'spreadPickBtn', stop: 'spreadStopShuffle', orbit: 'spreadOrbit', status: 'spreadPickStatus', fan: 'spreadFan' },
} as const;

// §5.8: mỗi nút bốc kèm một dòng gợi ý bên dưới — bố cục ở styles/draw-stage.css.
// Hai style dưới là trạng thái engine đọc/ghi trực tiếp (style.display) nên giữ nội tuyến.
const STATUS_STYLE: CSSProperties = { display: 'none', marginTop: 10 };
const HIDDEN: CSSProperties = { display: 'none' };

type Mode = 'draw' | 'pick';
interface Run {
  token: number;
  mode: Mode;
  shuffle: { stop(): void } | null;
  wheel: { cancel(): void } | null;
}

export const DrawStage = forwardRef<DrawStageHandle, DrawStageProps>(function DrawStage(props, ref) {
  const { ctx, leading, trailing } = props;
  const { t, pick } = useT();
  const ids = IDS[ctx];
  const dbReady = useApp(s => s.dbStatus === 'ready' && s.db !== null);
  const [shuffling, setShuffling] = useState(false);

  const orbitRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<Run | null>(null);
  const ritualReqRef = useRef<object | null>(null);
  const mountedRef = useRef(false);
  // Prop mới nhất (count/onPicked/doneMsg được đọc trễ, sau Dừng và sau vài giây bánh xe)
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });


  /** Dừng êm khung xào (resetOrbit/stopOrbit của bản cũ): không chia bài. */
  const clearOrbit = useCallback((run: Run) => {
    run.shuffle?.stop();
    run.shuffle = null;
    const orbit = orbitRef.current;
    if (orbit) {
      orbit.classList.remove('on');
      orbit.innerHTML = '';
    }
    setShuffling(false);
  }, []);

  /** Huỷ cả lượt (bị lượt mới thay hoặc gỡ component): khung xào + bánh xe, không còn hẹn giờ nào. */
  const cancelRun = useCallback(
    (run: Run) => {
      clearOrbit(run);
      run.wheel?.cancel();
      run.wheel = null;
    },
    [clearOrbit],
  );

  /** finishOrbit → startManualPick: bánh xe dùng chung; 'pick' = người dùng chạm chọn, 'draw' = tự rút. */
  const startPick = useCallback((run: Run) => {
    const fan = fanRef.current, status = statusRef.current, orbit = orbitRef.current;
    const { db, deck, lang } = useApp.getState();
    if (!fan || !status || !db || !isLive(run.token)) return;
    orbit?.classList.remove('on');
    const size = db.count(deck ?? '') || 78;
    const fullPool = () => drawRandomCards(db.query({ deck }), size); // cả bộ bài
    const pool = fullPool();
    if (!pool.length) return;
    status.style.display = 'block';
    run.wheel = startWheel(fan, {
      pool,
      n: propsRef.current.count,
      auto: run.mode !== 'pick',
      lang,
      reduce: prefersReducedMotion(),
      onStatus: text => {
        status.textContent = text;
      },
      onDone: cards => {
        if (!isLive(run.token)) return;
        propsRef.current.onPicked(cards, () => isLive(run.token));
        status.textContent = propsRef.current.doneMsg(cards.length);
      },
      reshufflePool: fullPool,
    });
  }, []);

  /** startOrbit của bản cũ: huỷ lượt đang dở ở mọi màn, rồi xào (bỏ qua khi giảm chuyển động). */
  const startOrbit = useCallback(
    (mode: Mode) => {
      const run: Run = { token: 0, mode, shuffle: null, wheel: null };
      run.token = claimDraw(() => cancelRun(run));
      runRef.current = run;
      propsRef.current.onStart();
      const fan = fanRef.current, status = statusRef.current, orbit = orbitRef.current;
      if (fan) fan.style.display = 'none';
      if (status) status.style.display = 'none';
      const reduce = prefersReducedMotion();
      if (reduce || !orbit) {
        startPick(run);
        // §5.8 (chỉ màn Bốc bài): giảm chuyển động bỏ qua xào → đưa bánh xe (đang hiện) vào giữa màn hình
        const target = fan && fan.style.display !== 'none' ? fan : orbit;
        if (ctx === 'draw' && target && isLive(run.token)) target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        return;
      }
      const { db, deck } = useApp.getState();
      run.shuffle = startShuffle(orbit, (db && db.count(deck ?? '')) || 78);
      orbit.classList.add('on');
      setShuffling(true);
      // §5.8 (chỉ màn Bốc bài): đưa khung xào vào giữa màn hình khi bắt đầu xào
      if (ctx === 'draw') orbit.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    },
    [ctx, cancelRun, startPick],
  );

  /** stopOrbit: dừng xào rồi mở bánh xe. */
  const stopOrbit = () => {
    const run = runRef.current;
    if (!run || !isLive(run.token)) return;
    clearOrbit(run);
    startPick(run);
  };

  /** beginDraw: nghi thức trước (nếu chưa tắt), rồi startOrbit. */
  const beginDraw = (mode: Mode) => {
    const st = useApp.getState();
    if (st.dbStatus !== 'ready' || !st.db) return; // chưa có bộ bài: không giữ chỗ, không gọi onStart
    ensureAudio(); // cử chỉ người dùng: đánh thức AudioContext
    if (st.prefs.ritualOff) {
      startOrbit(mode);
      return;
    }
    const req = {
      question: propsRef.current.question,
      start: () => {
        ritualReqRef.current = null;
        if (mountedRef.current) startOrbit(mode);
      },
    };
    ritualReqRef.current = req;
    st.requestRitual(req);
  };

  /** Huỷ lượt của màn này: dừng xào / bánh xe, nhả chỗ, đóng nghi thức nếu do màn này mở. */
  const abandon = useCallback(() => {
    const run = runRef.current;
    runRef.current = null;
    if (run) {
      cancelRun(run);
      releaseDraw(run.token);
    }
    const st = useApp.getState();
    if (st.ritual && st.ritual === ritualReqRef.current) st.closeRitual();
    ritualReqRef.current = null;
  }, [cancelRun]);

  useImperativeHandle(ref, () => ({
    hideFan() {
      if (fanRef.current) fanRef.current.style.display = 'none';
    },
    cancel() {
      abandon();
      if (fanRef.current) fanRef.current.style.display = 'none';
      if (statusRef.current) statusRef.current.style.display = 'none';
    },
  }), [abandon]);

  // Gỡ (vd. rời màn giữa chừng): huỷ lượt như cancel()
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abandon();
    };
  }, [abandon]);

  // title của bản cũ chỉ có ở màn Trải bài; §5.8 đổi tên nút → title theo tên mới
  const titles = ctx === 'reading'
    ? {
        auto: pick({ vi: 'Máy bốc ngẫu nhiên (thay trải bài hiện tại)', en: 'Draw for me (replaces the current spread)' }),
        pick: pick({ vi: 'Tự tay chọn từng lá trên bánh xe', en: 'Pick my own cards on the wheel' }),
      }
    : { auto: undefined, pick: undefined };

  return (
    <>
      <div className={ids.row + ' draw-stage'}>
        {leading ? <div className="draw-count">{leading}</div> : null}
        <div className="draw-modes">
          <div className="draw-mode">
            <button className="btn-primary" id={ids.auto} title={titles.auto} disabled={shuffling || !dbReady} onClick={() => beginDraw('draw')}>
              {t('draw.auto')}
            </button>
            <span className="hint">{t('draw.auto.hint')}</span>
          </div>
          <div className="draw-mode">
            <button id={ids.pick} title={titles.pick} disabled={shuffling || !dbReady} onClick={() => beginDraw('pick')}>
              {t('draw.manual')}
            </button>
            <span className="hint">{t('draw.manual.hint')}</span>
          </div>
        </div>
        {/* Hàng phụ: nút Dừng (chỉ hiện khi đang xào) + phần thêm của màn (âm thanh, "Đưa sang Trải bài AI") */}
        <div className="draw-extra" hidden={!shuffling && !trailing}>
          <button id={ids.stop} style={{ display: shuffling ? 'inline-block' : 'none' }} onClick={stopOrbit}>
            {t(ctx === 'draw' ? 'draw.stop' : 'reading.spreadStop')}
          </button>
          {trailing}
        </div>
      </div>
      <div id={ids.orbit} className="riffle" ref={orbitRef}></div>
      <div className="ai-hint" id={ids.status} style={STATUS_STYLE} ref={statusRef}></div>
      <div id={ids.fan} className="fan" style={HIDDEN} ref={fanRef}></div>
    </>
  );
});
