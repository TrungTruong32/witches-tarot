// Bảng route của app. "/" = trang mở đầu; mỗi màn hình khác có đường dẫn riêng (nút Back của trình duyệt dùng được).
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { Background } from '../components/Background';
import { IconSprite } from '../components/IconSprite';
import { Lightbox } from '../components/Lightbox';
import { RitualOverlay } from '../components/spread/RitualOverlay';
import { setSfxEnabled } from '../engines/audio';
import { Browse } from '../features/browse/Browse';
import { ComingSoon } from '../features/ComingSoon';
import { Daily } from '../features/daily/Daily';
import { Draw } from '../features/draw/Draw';
import { History } from '../features/history/History';
import { YesNo } from '../features/yesno/YesNo';
import { Landing } from '../features/landing/Landing';
import { Reading } from '../features/reading/Reading';
import { AppLayout } from './AppLayout';
import { MODE_BY_PATH, PATH_BY_MODE, VIEW_ID, type Mode } from './modes';
import { syncRootAttrs } from './rootAttrs';
import { useApp } from './store';

export { MODE_BY_PATH, PATH_BY_MODE } from './modes';

/** Giữ thuộc tính gốc (theme, fx, lang, --cardback, body[data-mode]) khớp với store và route hiện tại. */
function RootAttrs() {
  const lang = useApp(s => s.lang);
  const prefs = useApp(s => s.prefs);
  const { pathname } = useLocation();
  const mode = MODE_BY_PATH[pathname] ?? null;
  // layout effect: áp trước lần vẽ đầu tiên như bản cũ (fx/sky/lang/--cardback không nhấp nháy một khung hình sai)
  useLayoutEffect(() => syncRootAttrs({ lang, prefs }, mode), [lang, prefs, mode]);
  return null;
}

/** Màn hình mới không mang theo menu/hộp thoại/ảnh phóng to của màn trước (vd. bấm Back khi đang mở menu).
 *  Ngoại lệ: `state.openNav` (nút ☰ ở trang mở đầu) vào app với menu mở sẵn. */
function ResetOverlaysOnNavigate() {
  const location = useLocation();
  const navType = useNavigationType();
  // Chỉ tôn trọng openNav ở đúng bước tiến (PUSH) do nút ☰ tạo; Back/Forward/tải lại (POP) không mở lại menu.
  const openNav = navType === 'PUSH' && (location.state as { openNav?: boolean } | null)?.openNav === true;
  // layout effect: đóng trước khi vẽ, không thấy menu/ảnh mở một khung hình rồi mới trượt đi
  useLayoutEffect(() => {
    useApp.setState({ overlay: openNav ? 'nav' : null, lightbox: null });
  }, [location.key, openNav]);
  return null;
}

/** Âm thanh lá bài theo cài đặt (thay soundOn/soundVol toàn cục của bản cũ) — một chỗ cho cả app. */
function SfxPrefs() {
  const soundOn = useApp(s => s.prefs.soundOn);
  const soundVol = useApp(s => s.prefs.soundVol);
  useEffect(() => setSfxEnabled(soundOn, soundVol), [soundOn, soundVol]);
  return null;
}

function Root() {
  return (
    <>
      <IconSprite />
      <RootAttrs />
      <SfxPrefs />
      <ResetOverlaysOnNavigate />
      {/* sau RootAttrs: layout effect đọc --star/--spark sau khi data-theme đã áp; DOM vẫn là sprite → aura → canvas như bản cũ */}
      <Background />
      <Outlet />
      <Lightbox />
      <RitualOverlay />
    </>
  );
}

/** Link chia sẻ `/#r=...` mở thẳng màn hình Trải bài (giữ nguyên hash), không hiện trang mở đầu. */
function LandingRoute() {
  const { hash } = useLocation();
  if (hash.startsWith('#r=')) return <Navigate to={PATH_BY_MODE.reading + hash} replace />;
  return <Landing />;
}

/** Phần tử gốc của một màn hình: đúng id cũ + hiệu ứng .view-in mỗi lần vào. */
export function View({ mode, children }: { mode: Mode; children: ReactNode }) {
  return (
    <div id={VIEW_ID[mode]} className="view-in">
      {children}
    </div>
  );
}

const SCREENS: Record<Mode, ReactNode> = {
  daily: <Daily />,
  browse: <Browse />,
  draw: <Draw />,
  reading: <Reading />,
  history: <History />,
  yesno: <YesNo />,
  sky: <ComingSoon />,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Root />}>
        <Route path="/" element={<LandingRoute />} />
        <Route element={<AppLayout />}>
          {(Object.keys(PATH_BY_MODE) as Mode[]).map(m => (
            <Route key={m} path={PATH_BY_MODE[m]} element={<View key={m} mode={m}>{SCREENS[m]}</View>} />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
