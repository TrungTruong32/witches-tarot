// Menu: dạng drawer trượt bên phải (< 1024px) và thanh vòm trời dính trên đầu (≥ 1024px). Theo bản cũ L921–934, L1905–1964.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MODE_BY_PATH, PATH_BY_MODE, type Mode } from '../app/modes';
import { useApp } from '../app/store';
import type { I18nKey } from '../i18n/vi';
import { stripGlyph, useT } from '../i18n/useT';
import { Icon, type IconName } from './Icon';
import { media, prefersReducedMotion, useOverlay } from './useOverlay';

const STAR = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M8 0Q9 6 16 8Q9 10 8 16Q7 10 0 8Q7 6 8 0Z"/></svg>';
/** Trang trí vòm trời (chép nguyên văn initNavDecor của bản cũ). */
const decoHtml = (reduced: boolean) =>
  '<span class="dust"></span>' +
  '<svg class="arch" viewBox="0 0 1000 100" preserveAspectRatio="none"><defs>' +
  '<linearGradient id="navArcG" x1="0" x2="1"><stop offset="0" style="stop-color:var(--spark);stop-opacity:0"/><stop offset=".18" style="stop-color:var(--spark);stop-opacity:.55"/><stop offset=".5" style="stop-color:var(--spark);stop-opacity:.9"/><stop offset=".82" style="stop-color:var(--spark);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--spark);stop-opacity:0"/></linearGradient>' +
  '<linearGradient id="navShine" gradientUnits="userSpaceOnUse" x1="-260" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
  (reduced
    ? ''
    : '<animate attributeName="x1" values="-260;1000;1000" keyTimes="0;.55;1" dur="9s" repeatCount="indefinite"/><animate attributeName="x2" values="0;1260;1260" keyTimes="0;.55;1" dur="9s" repeatCount="indefinite"/>') +
  '</linearGradient></defs>' +
  '<path d="M14 38Q500 -22 986 38" fill="none" stroke="url(#navArcG)" stroke-width="1" vector-effect="non-scaling-stroke"/>' +
  '<path d="M14 38Q500 -22 986 38" fill="none" stroke="url(#navShine)" stroke-width="1.6" vector-effect="non-scaling-stroke" opacity=".8"/>' +
  '<path d="M60 96Q500 74 940 96" fill="none" stroke="url(#navArcG)" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".35"/>' +
  '</svg><span class="st l">' + STAR + '</span><span class="st r">' + STAR + '</span>';

interface NavItem { id: string; label: I18nKey; icon: IconName; mode?: Mode }
const MODE_ITEMS: NavItem[] = [
  { id: 'modeBrowse', label: 'nav.browse', icon: 'browse', mode: 'browse' },
  { id: 'modeDraw', label: 'nav.draw', icon: 'card', mode: 'draw' },
  { id: 'modeReading', label: 'nav.reading', icon: 'ball', mode: 'reading' },
  { id: 'modeSky', label: 'nav.sky', icon: 'planet', mode: 'sky' },
  { id: 'modeYesno', label: 'nav.yesno', icon: 'scales', mode: 'yesno' },
  { id: 'modeHistory', label: 'nav.history', icon: 'hourglass', mode: 'history' },
];

/** Nút có icon: <svg.ico> + <span.lbl> với nhãn đã bỏ ký hiệu đầu (như setLabel của bản cũ). */
export function IconLabel({ icon, text }: { icon: IconName; text: string }) {
  return (
    <>
      <Icon name={icon} />
      <span className="lbl">{stripGlyph(text)}</span>
    </>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}

/** Đặt độ lệch dọc cho từng mục theo parabol → các mục xếp thành vòm (layoutNavArc của bản cũ). */
function layoutNavArc(nav: HTMLElement) {
  const items = [...nav.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && (el.classList.contains('tab-btn') || el.classList.contains('nav-sep')) && getComputedStyle(el).display !== 'none',
  );
  const n = items.length;
  items.forEach((el, i) => {
    const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
    el.style.setProperty('--ay', (13 * t * t).toFixed(1) + 'px');
  });
}

export function NavMenu() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = MODE_BY_PATH[pathname];
  const open = useApp(s => s.overlay === 'nav');
  const closeOverlay = useApp(s => s.closeOverlay);
  const openOverlay = useApp(s => s.openOverlay);
  const navRef = useRef<HTMLDivElement>(null);
  const installEvt = useRef<BeforeInstallPromptEvent | null>(null);
  const [installVisible, setInstallVisible] = useState(false);
  const [reduced] = useState(prefersReducedMotion);

  useOverlay(open, closeOverlay);

  // Vòm trời: tính lại khi đổi kích thước / đổi chế độ desktop / hiện nút cài đặt
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const relayout = () => layoutNavArc(nav);
    relayout();
    window.addEventListener('resize', relayout);
    return () => window.removeEventListener('resize', relayout);
  }, [installVisible]);

  // Tự ẩn khi cuộn xuống (desktop), hiện lại khi cuộn lên hoặc rê chuột lên mép trên
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const desk = media('(min-width: 1024px)');
    let lastY = window.scrollY;
    let ticking = false;
    let raf = 0;
    const show = () => nav.classList.remove('nav-hidden');
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        const dy = y - lastY;
        if (!desk.matches || y < 160) show();
        else if (dy > 8) nav.classList.add('nav-hidden');
        else if (dy < -8) show();
        if (Math.abs(dy) > 8 || y < 160) lastY = y;
      });
    };
    const onMouse = (e: MouseEvent) => {
      if (desk.matches && e.clientY < 70) show();
    };
    const onDesk = () => {
      show();
      layoutNavArc(nav);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouse, { passive: true });
    nav.addEventListener('focusin', show);
    desk.addEventListener('change', onDesk);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouse);
      nav.removeEventListener('focusin', show);
      desk.removeEventListener('change', onDesk);
    };
  }, []);

  // Cài ứng dụng (PWA)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEvt.current = e as BeforeInstallPromptEvent;
      setInstallVisible(true);
    };
    const onInstalled = () => {
      installEvt.current = null;
      setInstallVisible(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    const e = installEvt.current;
    if (!e) return;
    void e.prompt();
    try {
      await e.userChoice;
    } catch {
      /* người dùng huỷ */
    }
    installEvt.current = null;
    setInstallVisible(false);
    closeOverlay();
  };

  const go = (mode: Mode) => {
    navigate(PATH_BY_MODE[mode]);
    closeOverlay();
  };

  return (
    <div className={'nav' + (open ? ' open' : '')} id="navMenu" ref={navRef}>
      <span className="nav-deco" aria-hidden="true" dangerouslySetInnerHTML={{ __html: decoHtml(reduced) }} />
      <div className="nav-head">
        <span>{t('menu')}</span>
        <button className="nav-close" id="navClose" aria-label="Đóng menu" onClick={closeOverlay}>✕</button>
      </div>
      <button className="tab-btn" id="goHome" data-ico="home" onClick={() => { closeOverlay(); navigate('/'); window.scrollTo({ top: 0 }); }}>
        <IconLabel icon="home" text={t('nav.home')} />
      </button>
      <button className={'tab-btn' + (current === 'daily' ? ' active' : '')} id="modeDaily" data-ico="moon" onClick={() => go('daily')}>
        <IconLabel icon="moon" text={t('nav.daily')} />
      </button>
      <button className="tab-btn" id="installBtn" data-ico="install" style={installVisible ? undefined : { display: 'none' }} onClick={() => void install()}>
        <IconLabel icon="install" text={t('nav.install')} />
      </button>
      {MODE_ITEMS.map(it => (
        <button key={it.id} className={'tab-btn' + (current === it.mode ? ' active' : '')} id={it.id} data-ico={it.icon} onClick={() => it.mode && go(it.mode)}>
          <IconLabel icon={it.icon} text={t(it.label)} />
        </button>
      ))}
      <span className="nav-sep" aria-hidden="true" />
      <button className="tab-btn" id="openSettings" data-ico="gear" onClick={() => openOverlay('ai')}>
        <IconLabel icon="gear" text={t('nav.settings')} />
      </button>
      <button className="tab-btn" id="openSite" data-ico="sliders" title="Giao diện, nhạc nền, hiệu ứng…" onClick={() => openOverlay('site')}>
        <IconLabel icon="sliders" text={t('nav.site')} />
      </button>
    </div>
  );
}
