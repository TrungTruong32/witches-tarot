// Lời mời cài ứng dụng (PWA). Chrome chỉ bắn `beforeinstallprompt` một lần, thường lúc người dùng còn ở trang mở đầu,
// nên phải bắt ở cấp ứng dụng (như bản cũ) rồi cất vào store; NavMenu chỉ đọc và gọi prompt().
import { useApp } from './store';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}

/** Đăng ký một lần khi khởi động. Trả về hàm gỡ (dùng trong test). */
export function initPwaInstall(win: Window): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    useApp.setState({ installPrompt: e as BeforeInstallPromptEvent });
  };
  const onInstalled = () => useApp.setState({ installPrompt: null });
  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  return () => {
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
  };
}

/** Hiện hộp cài đặt của trình duyệt; lời mời chỉ dùng được một lần nên luôn xoá sau đó. */
export async function promptInstall(): Promise<void> {
  const e = useApp.getState().installPrompt;
  if (!e) return;
  void e.prompt();
  try {
    await e.userChoice;
  } catch {
    /* người dùng huỷ */
  }
  useApp.setState({ installPrompt: null });
}
