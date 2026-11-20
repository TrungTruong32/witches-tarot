// Khung app (#appPage) quanh mọi màn hình trừ trang mở đầu. Theo markup bản cũ L909–941.
import { Outlet } from 'react-router-dom';
import { DeckSelect } from '../components/DeckSelect';
import { Logo } from '../components/Logo';
import { NavMenu } from '../components/NavMenu';
import { useT } from '../i18n/useT';
import { useApp } from './store';

function BootStatus() {
  const status = useApp(s => s.dbStatus);
  const error = useApp(s => s.dbError);
  if (status === 'error') return <div id="bootStatus" className="status error">{error}</div>;
  return (
    <div id="bootStatus" className="status" style={status === 'ready' ? { display: 'none' } : undefined}>
      Đang tải cơ sở dữ liệu SQLite…
    </div>
  );
}

export function AppLayout() {
  const { t } = useT();
  const navOpen = useApp(s => s.overlay === 'nav');
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = useApp(s => s.closeOverlay);
  const ready = useApp(s => s.dbStatus === 'ready');
  return (
    <>
      <button className="nav-toggle" id="navToggle" aria-label="Mở menu" onClick={() => openOverlay('nav')}>☰</button>
      <div className={'nav-scrim' + (navOpen ? ' open' : '')} id="navScrim" onClick={closeOverlay} />
      <div className="page page-in" id="appPage">
        <header>
          <div className="brand">
            <Logo variant="H" />
            <h2 className="brand-name">Witches Tarot</h2>
          </div>
          <p>{t('tagline')}</p>
        </header>
        <NavMenu />
        <div className="deckbar" id="deckBar" style={ready ? { display: 'flex' } : { display: 'none' }}>
          <label htmlFor="deckSelect">Bộ bài:</label>
          <DeckSelect id="deckSelect" />
        </div>
        <BootStatus />
        <Outlet />
      </div>
    </>
  );
}
