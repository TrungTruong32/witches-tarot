// Bảng route của app. "/" = trang mở đầu; mỗi màn hình khác có đường dẫn riêng (nút Back của trình duyệt dùng được).
import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { IconSprite } from '../components/IconSprite';
import { Lightbox } from '../components/Lightbox';
import { ComingSoon } from '../features/ComingSoon';
import { Landing } from '../features/landing/Landing';
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
  useEffect(() => syncRootAttrs({ lang, prefs }, mode), [lang, prefs, mode]);
  return null;
}

function Root() {
  return (
    <>
      <IconSprite />
      <RootAttrs />
      <Outlet />
      <Lightbox />
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
  daily: <ComingSoon />,
  browse: <ComingSoon />,
  draw: <ComingSoon />,
  reading: <ComingSoon />,
  history: <ComingSoon />,
  yesno: <ComingSoon />,
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
