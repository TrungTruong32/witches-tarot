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
// Cập nhật: SW mới skipWaiting + clients.claim → điều khiển ngay các tab đang mở (sự kiện 'controllerchange').
// Cố ý KHÔNG nghe 'controllerchange' để tự tải lại: tải lại giữa chừng làm mất lượt trải bài / câu hỏi đang gõ.
// Tab cũ chạy tiếp JS cũ tới lần mở/điều hướng sau (lúc đó mới nhận index.html + assets mới). Hệ quả cần biết:
// cache app cũ bị xoá khi SW mới activate, nên chunk tải lười của bản cũ (vd. sql.js) nếu chưa tải trước đó sẽ phải
// đi mạng — hiện mọi chunk lười đều nạp ngay lúc khởi động nên không gặp trường hợp này.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
