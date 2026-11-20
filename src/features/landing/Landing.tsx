// Trang mở đầu: ô hỏi → vào thẳng Trải bài AI và mở bánh xe chọn lá; menu trên cùng; quạt bài trang trí.
// Markup theo bản cũ L852–907, hành vi theo initLanding L2019–2098.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATH_BY_MODE, type Mode, type ReadingEntryState } from '../../app/modes';
import { useApp } from '../../app/store';
import { IconLabel } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { moonPhase, moonSvg } from '../../core/moon';
import type { I18nKey } from '../../i18n/vi';
import { useT } from '../../i18n/useT';
import { fanDrop, layoutFan } from './fan';
import { LT_ARROW, LT_ORN, LT_SEO_INNER, LT_STARS } from './landingMarkup';

const TIPS = {
  vi: ['Mối quan hệ này sẽ đi về đâu?', 'Tôi nên tập trung vào điều gì lúc này?', 'Công việc của tôi thời gian tới ra sao?', 'Vũ trụ muốn nhắn nhủ tôi điều gì hôm nay?', 'Tôi có nên nắm lấy cơ hội này không?'],
  en: ['Where is this relationship heading?', 'What should I focus on right now?', 'How will my work unfold soon?', 'What message does the universe have for me today?', 'Should I take this opportunity?'],
};
const NAV: { go: Mode; key: I18nKey }[] = [
  { go: 'reading', key: 'landing.nReading' },
  { go: 'draw', key: 'landing.nDraw' },
  { go: 'daily', key: 'landing.nDaily' },
  { go: 'yesno', key: 'landing.nYesno' },
  { go: 'browse', key: 'landing.nBrowse' },
  { go: 'sky', key: 'landing.nSky' },
];
const MAX = 300;

function Static({ html }: { html: string }) {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Landing() {
  const { t, pick, lang } = useT();
  const navigate = useNavigate();
  const status = useApp(s => s.dbStatus);
  const dbError = useApp(s => s.dbError);

  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(0);
  const [tip, setTip] = useState(0);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [showDbError, setShowDbError] = useState(false);
  // Kích thước cửa sổ (cả cao): thanh địa chỉ di động / chia đôi màn hình chỉ đổi chiều cao nhưng vẫn phải tính lại độ hạ quạt
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [drop, setDrop] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  // Chỉ làm việc khi DB đã sẵn sàng (như whenReady của bản cũ). Lỗi DB → báo lỗi thay vì chờ mãi.
  const whenReady = (fn: () => void) => {
    if (status === 'ready') fn();
    else if (status === 'error') setShowDbError(true);
    else setPending(() => fn);
  };
  useEffect(() => {
    if (!pending) return;
    if (status === 'ready') {
      pending();
      setPending(null);
    } else if (status === 'error') {
      setPending(null);
      setShowDbError(true);
    }
  }, [status, pending]);

  // Gợi ý xoay vòng mỗi 3,8 giây, dừng khi đang gõ / đang có chữ
  const pausedRef = useRef(false);
  pausedRef.current = focused || q.length > 0;
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setTip(i => (i + 1) % TIPS.vi.length);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  // Lỗi "chưa nhập câu hỏi" tự ẩn sau 2,6 giây
  useEffect(() => {
    if (!err) return;
    const id = setTimeout(() => setErr(false), 2600);
    return () => clearTimeout(id);
  }, [err, shake]);

  // Quạt bài: tính lại khi đổi kích thước (debounce 150 ms) và khi font đã tải
  useEffect(() => {
    let tm = 0;
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    const onResize = () => {
      clearTimeout(tm);
      tm = window.setTimeout(measure, 150);
    };
    window.addEventListener('resize', onResize);
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
      clearTimeout(tm);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const fan = useMemo(() => layoutFan(vp.w), [vp.w]);
  useLayoutEffect(() => {
    const r = skipRef.current?.getBoundingClientRect();
    setDrop(fanDrop(fan.cw, vp.h, r && r.height ? r.bottom : null));
  }, [fan, vp]);

  // Lắc ô nhập: gỡ class rồi gắn lại để animation chạy lại mỗi lần
  useLayoutEffect(() => {
    const f = formRef.current;
    if (!f || !shake) return;
    f.classList.remove('shake');
    void f.offsetWidth;
    f.classList.add('shake');
  }, [shake]);

  const moon = useMemo(() => {
    const m = moonPhase(new Date());
    // Giống renderMoon của bản cũ (chữ chỉ có tiếng Việt). Nội dung do code sinh, không có dữ liệu người dùng.
    return { html: moonSvg(m.frac, 'moon-svg sm') + '<span>' + m.n + ' · ' + m.illum + '% sáng</span>' };
  }, []);

  const goReading = (question: string) =>
    whenReady(() => navigate(PATH_BY_MODE.reading, { state: { question, autoPick: true } satisfies ReadingEntryState }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) {
      setErr(true);
      setShake(n => n + 1);
      inputRef.current?.focus();
      return;
    }
    goReading(v);
  };

  const waiting = pending !== null;
  return (
    <div id="landing">
      <header className="lt-top">
        <button type="button" className="lt-brand" id="landingEnter" title="Bước vào ứng dụng" disabled={waiting}
          onClick={() => whenReady(() => navigate(PATH_BY_MODE.daily))}>
          {waiting ? <><span className="spinner" /> {pick({ vi: 'Đang chuẩn bị bầu trời…', en: 'Preparing the sky…' })}</> : <IconLabel icon="compass" text={t('landing.enter')} />}
        </button>
        <nav className="lt-nav" aria-label="Menu">
          {NAV.map(n => (
            <button key={n.go} type="button" data-go={n.go} onClick={() => whenReady(() => navigate(PATH_BY_MODE[n.go]))}>{t(n.key)}</button>
          ))}
        </nav>
        <button type="button" className="lt-burger" id="landingBurger" aria-label="Mở menu"
          onClick={() => whenReady(() => navigate(PATH_BY_MODE.daily, { state: { openNav: true } }))}>☰</button>
      </header>
      <div className="landing-inner">
        <div className="landing-moon" id="landingMoon" dangerouslySetInnerHTML={{ __html: moon.html }} />
        <p className="lt-pre">{t('landing.pre')}</p>
        <h1 className="lt-title">
          <span>Witches</span>
          <span className="lt-emblem"><Logo variant="L" /></span>
          <br />
          <span>Tarot</span>
        </h1>
        <p className="landing-sub">{t('landing.sub')}</p>
        <form className="lt-form" id="askForm" autoComplete="off" noValidate ref={formRef} onSubmit={submit}>
          <Static html={LT_STARS} />
          <div className="lt-input">
            <Static html={LT_ORN} />
            <Static html={LT_ARROW} />
            <input id="askInput" type="text" maxLength={MAX} ref={inputRef} value={q}
              placeholder={TIPS[lang === 'en' ? 'en' : 'vi'][tip]}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              onChange={e => { setQ(e.target.value); setErr(false); }} />
            <span className={'lt-err' + (err ? ' show' : '')} id="askErr">{t('landing.askErr')}</span>
            <span className={'lt-count' + (q.length > 0 ? ' show' : '')} id="askCount">{q.length + '/' + MAX}</span>
          </div>
          <p className="lt-disc">{t('landing.disc')}</p>
          <button type="submit" className="lt-cta" id="askGo"><i></i><i></i><span>{t('landing.askGo')}</span></button>
          <button type="button" className="lt-skip" id="askSkip" ref={skipRef} onClick={() => goReading('')}>{t('landing.skip')}</button>
          {showDbError && <p className="status error" id="landingError" role="alert">{dbError}</p>}
        </form>
      </div>
      <section className="lt-seo" aria-labelledby="ltSeoTitle" dangerouslySetInnerHTML={{ __html: LT_SEO_INNER }} />
      <div className="lt-deco" aria-hidden="true">
        <div className="lt-circles"><span></span><span></span><span></span></div>
        <div className="lt-orb"></div>
        <div className="lt-fan" id="landingFan" style={{ '--cw': fan.cw + 'px', '--R': fan.R + 'px', '--drop': drop.toFixed(0) + 'px' } as CSSProperties}>
          {fan.cards.map((c, i) => (
            <span key={i} className="lc" style={{ '--a': c.a + 'deg', '--dl': c.dl + 's' } as CSSProperties}></span>
          ))}
        </div>
      </div>
    </div>
  );
}
