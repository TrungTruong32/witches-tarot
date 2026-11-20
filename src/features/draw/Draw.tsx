// Màn "Bốc bài" (/boc-bai) — CỐ Ý KHÁC bản cũ theo spec §5.8: dùng chung ô chọn kiểu trải + bàn trải đánh số với Trải bài AI,
// rút xong thì cuộn tới bàn rồi chia lá theo thứ tự, ý nghĩa từng lá hiện bên dưới kèm tên vị trí.
// Giữ markup/lớp CSS cũ (L964–982, drawCardInner L4582, DRAW_CTX.draw L4763), không thêm CSS mới.
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { PATH_BY_MODE } from '../../app/modes';
import { useApp } from '../../app/store';
import { IconLabel } from '../../components/Icon';
import { DrawStage, type DrawStageHandle } from '../../components/spread/DrawStage';
import { SpreadBoard, type SpreadBoardHandle } from '../../components/spread/SpreadBoard';
import { SpreadPicker } from '../../components/spread/SpreadPicker';
import { cardText } from '../../core/cards';
import { readDrawCount, toSpreadCard } from '../../core/draw';
import { renderMarkdown } from '../../core/markdown';
import { moonPhase, moonSvg } from '../../core/moon';
import { defsFor } from '../../core/spreads';
import type { CardEnMap, Lang, SpreadCard } from '../../core/types';
import { ensureAudio } from '../../engines/audio';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';
import { useReading } from '../reading/readingStore';

/** 'deal' = lá đã rút, đang chờ/đang chia vào bàn; 'done' = chia xong, hiện ý nghĩa. */
type Phase = 'idle' | 'deal' | 'done';

/** Một lá kết quả — markup của drawCardInner (bản cũ), số thứ tự kèm tên vị trí khi kiểu trải có vị trí. */
function DrawCard({ c, i, pos, lang, cardEn, reduce }: { c: SpreadCard; i: number; pos: string | null; lang: Lang; cardEn: CardEnMap | null; reduce: boolean }) {
  const ct = cardText(c, lang, cardEn);
  const rev = c.orientation === 'nguoc';
  const meaning = rev ? ct.nghia_nguoc : ct.y_nghia_xuoi;
  const revTxt = lang === 'en' ? 'Reversed' : 'Ngược', upTxt = lang === 'en' ? 'Upright' : 'Xuôi';
  return (
    <div className={'draw-card revealed' + (reduce ? '' : ' dealt')} style={{ animationDelay: i * 90 + 'ms' }}>
      <div className="flip revealed">
        <div className="flip-inner">
          <div className="flip-face flip-front"></div>
          <div className="flip-face flip-back">
            {c.image_url
              ? <img src={c.image_url} alt={c.ten} className={rev ? 'rev' : ''} loading="lazy" />
              : <div className="noimg">{c.ten + (rev ? ' (' + revTxt.toLowerCase() + ')' : '')}</div>}
          </div>
        </div>
      </div>
      <div className="draw-meta">
        <div className="draw-name">
          {i + 1}. {pos ? pos + ' — ' : ''}{c.ten} <span className={'orient-badge ' + c.orientation}>{rev ? revTxt : upTxt}</span>
        </div>
        {c.bo ? <div className="time">{c.bo}</div> : null}
        {/* renderMarkdown escape trước khi thêm thẻ → an toàn với nội dung lá */}
        <div className="ai-output" style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(meaning || '') }} />
      </div>
    </div>
  );
}

export function Draw() {
  const { t, lang } = useT();
  const en = lang === 'en';
  const deck = useApp(s => s.deck);
  const cardEn = useApp(s => s.cardEn);
  const soundOn = useApp(s => s.prefs.soundOn);
  const setPref = useApp(s => s.setPref);
  const question = useReading(s => s.question);
  const spreadKey = useReading(s => s.drawSpreadKey);
  const result = useReading(s => s.drawResult);
  const positions = defsFor(spreadKey, lang);
  const navigate = useNavigate();

  const [countRaw, setCountRaw] = useState('3');
  // Quay lại màn khi đã có kết quả (kể cả rời giữa lúc chia) → hiện sẵn bàn + ý nghĩa
  const [phase, setPhase] = useState<Phase>(() => (useReading.getState().drawResult.length ? 'done' : 'idle'));

  const stageRef = useRef<DrawStageHandle>(null);
  const boardRef = useRef<SpreadBoardHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // renderMoon (L5092): chữ chỉ có tiếng Việt như bản cũ; nội dung do code sinh, không có dữ liệu người dùng
  const moonHtml = useMemo(() => {
    const m = moonPhase(new Date());
    return '<span class="m-emoji">' + moonSvg(m.frac) + '</span><span class="m-body">' +
      '<span class="m-name">' + m.n + ' · ' + m.illum + '% sáng</span>' +
      '<span class="m-sub">' + m.h + '</span></span>';
  }, []);

  /** Đổi kiểu trải: kết quả cũ gắn với vị trí của kiểu trước → bỏ, bàn hiện ô trống của kiểu mới. */
  const onSpread = (k: string) => {
    if (k === spreadKey) return;
    clearTimers();
    const st = useReading.getState();
    st.setDrawSpreadKey(k);
    if (st.drawResult.length) st.setDrawResult([]);
    setPhase('idle');
  };

  // onStart của DRAW_CTX.draw: xoá kết quả, khoá nút "Đưa sang Trải bài AI"
  const onStart = () => {
    clearTimers();
    useReading.getState().setDrawResult([]);
    setPhase('idle');
  };

  // Như DRAW_CTX.reading.onPicked (§5.8.3): 1600 ms sau thu bánh xe, cuộn tới bàn → 450 ms sau chia lá → hiện ý nghĩa
  const onPicked = (picked: SpreadCard[], live: () => boolean) => {
    const next = picked.map(toSpreadCard);
    flushSync(() => {
      useReading.getState().setDrawResult(next);
      setPhase('deal');
    });
    const reduce = prefersReducedMotion();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.current = timers.current.filter(x => x !== id);
        fn();
      }, ms);
      timers.current.push(id);
    };
    later(() => {
      if (!live()) return;
      stageRef.current?.hideFan();
      const board = panelRef.current?.querySelector<HTMLElement>('#drawBoard');
      (board && !board.hidden ? board : resultsRef.current)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      later(() => {
        if (!live()) return;
        void boardRef.current?.deal().then(() => {
          if (live() && useReading.getState().drawResult === next) setPhase('done');
        });
      }, reduce ? 0 : 450);
    }, reduce ? 0 : 1600);
  };

  // setSoundOn (L4745): nút ♫︎ mờ + gạch ngang khi tắt
  const toggleSound = () => {
    if (!soundOn) ensureAudio();
    setPref('soundOn', !soundOn);
  };

  // #drawToReading (L5480): mang kiểu trải + các lá sang Trải bài AI, danh sách lật lần lượt (renderSpread(true))
  const toReading = () => {
    const st = useReading.getState();
    if (!st.drawResult.length) return;
    st.setSpreadKey(st.drawSpreadKey);
    st.setCards(st.drawResult.map(toSpreadCard), 'seq');
    navigate(PATH_BY_MODE.reading);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const done = phase === 'done' && result.length > 0;
  const reduce = prefersReducedMotion();

  return (
    <div className="panel" ref={panelRef}>
      <div id="moonBadge" className="moon-badge" dangerouslySetInnerHTML={{ __html: moonHtml }} />
      <div className="ai-hint" id="drawInfo" style={{ marginBottom: 12 }}>
        {en
          ? 'Drawing from deck: “' + (deck || '—') + '”. Shuffle randomly and set Upright/Reversed yourself (cards with no reversed meaning stay Upright). Change deck in the “Deck” bar above.'
          : 'Bốc từ bộ: “' + (deck || '—') + '”. Xào ngẫu nhiên và tự chọn chiều Xuôi/Ngược (lá không có nghĩa ngược sẽ để Xuôi). Đổi bộ ở thanh “Bộ bài” phía trên.'}
      </div>
      <SpreadPicker id="drawSpreadPicker" value={spreadKey} onChange={onSpread} />
      <DrawStage
        ref={stageRef}
        ctx="draw"
        count={positions ? positions.length : readDrawCount(countRaw)}
        question={question}
        onStart={onStart}
        onPicked={onPicked}
        doneMsg={k => en
          ? '✓ Drew ' + k + ' card' + (k > 1 ? 's' : '') + '. Scroll down for the meanings, or tap “Send to AI Reading”.'
          : '✓ Đã bốc đủ ' + k + ' lá. Kéo xuống xem ý nghĩa, hoặc bấm “Đưa sang Trải bài AI”.'}
        leading={positions ? null : (
          <>
            <label htmlFor="drawCount">Số lá:</label>
            <input id="drawCount" type="number" min="1" max="12" value={countRaw} onChange={e => setCountRaw(e.target.value)} />
          </>
        )}
        trailing={
          <>
            <button
              id="soundToggle"
              title="Bật/tắt tiếng xào"
              style={soundOn ? undefined : { opacity: '.45', textDecoration: 'line-through' }}
              onClick={toggleSound}
            >
              ♫︎
            </button>
            <button id="drawToReading" data-ico="ball" disabled={!done} onClick={toReading}>
              <IconLabel icon="ball" text={t('draw.toReading')} />
            </button>
          </>
        }
      />
      <SpreadBoard ref={boardRef} id="drawBoard" spreadKey={spreadKey} cards={result} positions={positions} mode={phase === 'deal' ? 'deal' : 'shown'} />
      <div id="drawResults" className="draw-results" ref={resultsRef}>
        {done ? result.map((c, i) => (
          <DrawCard key={c.uid ?? i} c={c} i={i} pos={positions ? positions[i] ?? null : null} lang={lang} cardEn={cardEn} reduce={reduce} />
        )) : null}
      </div>
    </div>
  );
}
