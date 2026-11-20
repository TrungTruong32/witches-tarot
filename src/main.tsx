import './styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { boot, watchLangForCardEn } from './app/boot';
import { initPwaInstall } from './app/pwaInstall';
import { AppRoutes } from './app/routes';

initPwaInstall(window);
watchLangForCardEn();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </StrictMode>,
  );
}
void boot();

// Service worker (dist/sw.js sinh lúc build) — chỉ bản production; đăng ký sau 'load' như bản cũ, lỗi thì bỏ qua.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
