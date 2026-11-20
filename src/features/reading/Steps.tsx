// Cột trái của "Trải bài AI": bước 1–4 (markup bản cũ L987–1046). Câu hỏi + chip, kiểu trải, rút bài / tự thêm lá,
// danh sách lá + dữ kiện trải bài, nút Diễn giải / Xóa, ghi chú lưu ẩn danh.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { DeckSelect } from '../../components/DeckSelect';
import { IconLabel } from '../../components/Icon';
import { DrawStage, type DrawStageHandle } from '../../components/spread/DrawStage';
import { SpreadBoard, type SpreadBoardHandle } from '../../components/spread/SpreadBoard';
import { SpreadPicker } from '../../components/spread/SpreadPicker';
import { readDrawCount, toSpreadCard } from '../../core/draw';
import { computeSpreadFacts, factLines } from '../../core/facts';
import { createCardSearch } from '../../core/search';
import { SPREADS, posDesc, spreadByKey } from '../../core/spreads';
import type { Card, SpreadCard } from '../../core/types';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';
import type { ReadingEntryState } from '../landing/Landing';
import { runInterpret, useInterpret } from './interpret';
import { majorNameLookup, positionsFor, useReading } from './readingStore';
import { SpreadList } from './SpreadList';

const CHIPS = [
  { k: 'chip.love', q: 'Tình cảm của tôi thời gian tới sẽ thế nào?', qen: 'How will my love life unfold in the near future?' },
  { k: 'chip.work', q: 'Công việc / sự nghiệp của tôi hiện tại ra sao?', qen: 'How is my work / career doing right now?' },
  { k: 'chip.money', q: 'Tài chính của tôi thời gian tới thế nào?', qen: 'How will my finances be in the near future?' },
  { k: 'chip.focus', q: 'Tôi nên tập trung vào điều gì lúc này?', qen: 'What should I focus on right now?' },
  { k: 'chip.msg', q: 'Thông điệp mà vũ trụ muốn nhắn nhủ tôi hôm nay là gì?', qen: 'What message does the universe have for me today?' },
] as const;

/** updateSpreadHint: tự do → một dòng; có vị trí → câu "dùng khi" + từng vị trí kèm mô tả. */
function SpreadHint({ spreadKey, positions }: { spreadKey: string; positions: string[] | null }) {
  const { lang } = useT();
  const en = lang === 'en';
  const s = spreadByKey(spreadKey);
  return (
    <div className="hint spread-hint" id="spreadHint">
      {!positions ? (
        en ? 'Add/draw any number of cards; no position labels.' : 'Thêm/bốc số lá tuỳ ý; không gắn nhãn vị trí.'
      ) : (
        <>
          {s?.use ? <div><em>{en ? s.use[1] : s.use[0]}</em></div> : null}
          {positions.map((p, i) => {
            const d = posDesc(spreadKey, i, lang);
            return <div key={i}>{i + 1}. <strong>{p}</strong>{d ? ' — ' + d : ''}</div>;
          })}
        </>
      )}
    </div>
  );
}

/** Ô "Đã rút bài thật? Tự thêm từng lá": tìm thông minh trong bộ đang chọn, ↑/↓/Enter/Esc (L2917–2960, L3015). */
function ManualAdd({ cards }: { cards: SpreadCard[] }) {
  const { t, lang } = useT();
  const en = lang === 'en';
  const db = useApp(s => s.db);
  const deck = useApp(s => s.deck);
  const addCard = useReading(s => s.addCard);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollActive = useRef(false);

  const search = useMemo(() => (db && deck ? createCardSearch(db.query({ deck })) : null), [db, deck]);
  const q = query.trim();
  const rows = useMemo<Card[]>(() => (q && search ? search(q, 8) : []), [q, search]);
  // Danh sách mới (gõ, xoá, đổi bộ bài) → dòng đầu là dòng đang chọn, như renderPicker của bản cũ
  const [rowsSeen, setRowsSeen] = useState(rows);
  if (rowsSeen !== rows) {
    setRowsSeen(rows);
    setActive(0);
  }

  useEffect(() => {
    if (!scrollActive.current) return;
    scrollActive.current = false;
    resultsRef.current?.querySelectorAll('.picker-item')[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const move = (i: number) => {
    if (!rows.length) return;
    scrollActive.current = true;
    setActive((i + rows.length) % rows.length);
  };
  const add = (card: Card) => {
    const ok = addCard(card);
    setQuery('');
    if (ok) inputRef.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(active - 1); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      const card = rows[active];
      if (card) { e.preventDefault(); add(card); }
    } else if (e.key === 'Escape') setQuery('');
  };

  return (
    <details className="manual-add">
      <summary>{t('reading.manual')}</summary>
      <label htmlFor="pickerInput" className="sr-only">{t('reading.picker')}</label>
      <input
        id="pickerInput"
        className="field-input"
        type="search"
        placeholder={t('reading.picker.ph')}
        value={query}
        ref={inputRef}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <div id="pickerResults" className="picker-results" ref={resultsRef}>
        {!q ? null : !rows.length ? (
          <div className="picker-empty">
            {en
              ? 'No matching card. Try e.g. “ace cups”, “1 swords”, “queen pentacles”, “13”, “moon”.'
              : 'Không thấy lá phù hợp. Thử: “át chén”, “1 kiếm”, “hoàng hậu tiền”, “13”, “mặt trăng”.'}
          </div>
        ) : (
          rows.map((card, i) => {
            const dup = cards.some(x => x.id === card.id);
            return (
              <button
                key={card.id}
                type="button"
                className={'card-item picker-item' + (i === active ? ' active' : '') + (dup ? ' dup' : '')}
                onClick={() => add(card)}
                onMouseEnter={() => move(i)}
              >
                <strong>{card.so} - {card.ten}</strong>
                <span>{card.bo || ''}{dup ? ' · ' + (en ? 'already in spread' : 'đã có trong trải bài') : ''}</span>
              </button>
            );
          })
        )}
      </div>
    </details>
  );
}

/** renderCloudNote: trạng thái lưu ẩn danh + link bật/tắt (setCloudSave). */
function CloudNote() {
  const { lang } = useT();
  const en = lang === 'en';
  const on = useApp(s => s.prefs.cloudSave);
  const setPref = useApp(s => s.setPref);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.target as Element;
    if (el.closest('[data-cloud-off]')) setPref('cloudSave', false);
    else if (el.closest('[data-cloud-on]')) setPref('cloudSave', true);
  };
  return (
    <div className="cloud-note" id="cloudNote" onClick={onClick}>
      {on ? (
        <>{en ? '☁︎ Readings are saved anonymously (no name, email or IP) to improve the app · ' : '☁︎ Trải bài được lưu ẩn danh (không tên, email hay IP) để cải thiện app · '}<a data-cloud-off="">{en ? 'turn off' : 'tắt'}</a></>
      ) : (
        <>{en ? 'Readings stay on this device only · ' : 'Trải bài chỉ lưu trong máy bạn · '}<a data-cloud-on="">{en ? 'turn on anonymous saving' : 'bật lưu ẩn danh'}</a></>
      )}
    </div>
  );
}

export function Steps() {
  const { t, lang } = useT();
  const en = lang === 'en';
  const db = useApp(s => s.db);
  const deck = useApp(s => s.deck);
  const question = useReading(s => s.question);
  const spreadKey = useReading(s => s.spreadKey);
  const cards = useReading(s => s.cards);
  const reveal = useReading(s => s.reveal);
  const setQuestion = useReading(s => s.setQuestion);
  const setSpreadKey = useReading(s => s.setSpreadKey);
  const clear = useReading(s => s.clear);
  const interpreting = useInterpret(s => s.running);
  const positions = positionsFor({ spreadKey }, lang);

  // Ô số lá: kiểu trải cố định khoá theo số vị trí (applySpreadType); về Tự do vẫn giữ số vừa khoá như bản cũ.
  const [countRaw, setCountRaw] = useState(() => (positions ? String(positions.length) : '3'));
  const onSpread = (k: string) => {
    const pos = positionsFor({ spreadKey: k }, lang);
    if (pos) setCountRaw(String(pos.length));
    setSpreadKey(k);
  };

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<DrawStageHandle>(null);
  const boardRef = useRef<SpreadBoardHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const autoPickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  // 'deal' chỉ do lượt bốc của chính màn này điều khiển → gặp lúc gắn = lượt cũ đã bị huỷ, hiện sẵn các lá.
  // Rời màn giữa lúc chia ('deal') hay lật lần lượt ('seq') → quay lại thấy các lá hiện sẵn, không chạy lại.
  // Kiểm tra trong microtask: StrictMode gỡ-rồi-gắn-lại đồng bộ, khi đó mounted đã true lại → không đụng tới.
  useEffect(() => {
    mounted.current = true;
    const st = useReading.getState();
    if (st.reveal === 'deal') st.setReveal('none');
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (autoPickTimer.current) clearTimeout(autoPickTimer.current);
      autoPickTimer.current = null;
      queueMicrotask(() => {
        const s = useReading.getState();
        if (!mounted.current && s.reveal !== 'none') s.setReveal('none');
      });
    };
  }, []);

  // Vào từ trang mở đầu (go() L2073): điền câu hỏi; sau 380 ms cuộn tới nút Tự chọn rồi bấm (bắt đầu bốc, kể cả nghi thức).
  // State của mục lịch sử được xoá ngay (replace) → rời màn trước 380 ms hay Back/Forward quay lại đều không bốc lần nữa.
  // Hẹn giờ không gắn với lần chạy effect này (replace đổi location.key); chỉ huỷ khi gỡ màn.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const entry = location.state as Partial<ReadingEntryState> | null;
    if (!entry || typeof entry.question !== 'string') return;
    useReading.getState().setQuestion(entry.question);
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
    if (!entry.autoPick) return;
    if (autoPickTimer.current) clearTimeout(autoPickTimer.current);
    autoPickTimer.current = setTimeout(() => {
      autoPickTimer.current = null;
      const pick = document.getElementById('spreadPickBtn') as HTMLButtonElement | null;
      if (pick && !pick.disabled) {
        pick.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
        pick.click();
      }
    }, 380);
  }, [location.key, location.state, location.pathname, location.search, location.hash, navigate]);

  // onPicked của DRAW_CTX.reading (L4789): đưa lá vào trải bài → 1600 ms sau thu bánh xe, cuộn tới bàn → 450 ms sau chia lá.
  const onPicked = (picked: SpreadCard[], live: () => boolean) => {
    const next = picked.map(toSpreadCard);
    flushSync(() => useReading.getState().setCards(next, 'deal'));
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
      const board = stepRef.current?.querySelector<HTMLElement>('#spreadBoard');
      (board && !board.hidden ? board : listRef.current)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      later(() => {
        if (!live()) return;
        void boardRef.current?.deal().then(() => {
          const s = useReading.getState();
          if (s.cards === next && s.reveal === 'deal') s.setReveal('none');
        });
      }, reduce ? 0 : 450);
    }, reduce ? 0 : 1600);
  };

  const facts = useMemo(() => {
    if (cards.length < 2) return [];
    return factLines(cards, computeSpreadFacts(cards), lang, majorNameLookup(db, cards));
  }, [cards, lang, db]);

  const pending = reveal === 'deal' && cards.length > 0 && !prefersReducedMotion();
  const has = cards.length > 0;

  return (
    <div className="panel reading-steps" ref={stepRef}>
      <div className="ai-hint" id="readingDeckInfo" hidden>
        {en
          ? 'Reading with deck: “' + (deck || '—') + '”. Switch deck in the selector next to the card search below (or the “Deck” bar above); the search only shows cards from that deck, and cards already in the spread keep their own deck.'
          : 'Đang trải bằng bộ: “' + (deck || '—') + '”. Đổi bộ ở ô chọn cạnh ô tìm lá bên dưới (hoặc thanh “Bộ bài” phía trên); ô tìm chỉ hiện lá của bộ đang chọn, lá đã thêm vào trải bài vẫn giữ bộ của nó.'}
      </div>
      <section className="step">
        <div className="step-head"><span className="step-no">1</span><h3>{t('reading.s1')}</h3><p className="step-desc">{t('reading.d1')}</p></div>
        <label htmlFor="questionInput" className="sr-only">{t('reading.question')}</label>
        <textarea id="questionInput" rows={3} placeholder={t('reading.q.ph')} value={question} ref={questionRef} onChange={e => setQuestion(e.target.value)}></textarea>
        <div className="q-chips">
          {CHIPS.map(c => (
            <button
              key={c.k}
              type="button"
              className="qchip"
              data-q={en ? c.qen : c.q}
              data-qen={c.qen}
              onClick={() => { setQuestion(en ? c.qen : c.q); questionRef.current?.focus(); }}
            >
              {t(c.k)}
            </button>
          ))}
        </div>
      </section>
      <section className="step">
        <div className="step-head"><span className="step-no">2</span><h3>{t('reading.s2')}</h3><p className="step-desc">{t('reading.d2')}</p></div>
        <SpreadPicker value={spreadKey} onChange={onSpread} />
        <label htmlFor="spreadType" className="sr-only">{t('reading.spreadType')}</label>
        {/* select ẩn như bản cũ: giá trị theo store spreadKey; người dùng chọn bằng các ô hình ở trên */}
        <select id="spreadType" className="step-select" hidden tabIndex={-1} aria-hidden="true" value={spreadKey} onChange={e => onSpread(e.target.value)}>
          {SPREADS.map(s => <option key={s.k} value={s.k}>{en ? s.en : s.vi}</option>)}
        </select>
        <SpreadHint spreadKey={spreadKey} positions={positions} />
      </section>
      <section className="step">
        <div className="step-head"><span className="step-no">3</span><h3>{t('reading.s3')}</h3><p className="step-desc">{t('reading.d3')}</p>
          <DeckSelect id="deckSelectReading" className="deck-inline step-aside" aria-label="Bộ bài" title="Bộ bài dùng để rút / tìm lá" />
        </div>
        <DrawStage
          ref={stageRef}
          ctx="reading"
          count={positions ? positions.length : readDrawCount(countRaw)}
          question={question}
          onStart={clearTimers}
          onPicked={onPicked}
          doneMsg={k => en
            ? '✓ Drew ' + k + ' card' + (k > 1 ? 's' : '') + ' into the spread. Set Upright/Reversed if needed, then tap “Interpret”.'
            : '✓ Đã bốc ' + k + ' lá vào trải bài. Chỉnh Xuôi/Ngược nếu cần rồi bấm “Diễn giải”.'}
          leading={
            <label className="count-field" htmlFor="spreadDrawCount"><span>{t('reading.count')}</span>
              <input
                id="spreadDrawCount"
                type="number"
                min="1"
                max="12"
                inputMode="numeric"
                value={positions ? String(positions.length) : countRaw}
                disabled={!!positions}
                onChange={e => setCountRaw(e.target.value)}
              /></label>
          }
        />
        <ManualAdd cards={cards} />
      </section>
      <section className="step">
        <div className="step-head"><span className="step-no">4</span><h3>{t('reading.s4')}</h3><p className="step-desc">{t('reading.d4')}</p></div>
        <SpreadBoard ref={boardRef} spreadKey={spreadKey} cards={cards} positions={positions} mode={reveal === 'deal' ? 'deal' : 'shown'} />
        <div className="hint step-sub">{t('reading.flipHint')}</div>
        <SpreadList ref={listRef} cards={cards} spreadKey={spreadKey} positions={positions} seq={reveal === 'seq'} pending={pending} />
        <details id="spreadFacts" className="facts-box" open style={facts.length ? undefined : { display: 'none' }}>
          <summary>{en ? '📊 Spread facts (computed, sent to the AI)' : '📊 Dữ kiện trải bài (tính tự động, gửi kèm cho AI)'}</summary>
          <div className="facts-body">{facts.map((l, i) => <div key={i}>• {l}</div>)}</div>
        </details>
        <div className="reading-actions">
          <button className="btn-primary" id="interpretBtn" disabled={!has || interpreting} onClick={() => void runInterpret()}>
            <IconLabel icon="ball" text={t('reading.interpret')} />
          </button>
          <button id="clearSpreadBtn" className="btn-ghost" disabled={!has} onClick={clear}>{t('reading.clear')}</button>
        </div>
        <CloudNote />
      </section>
    </div>
  );
}
