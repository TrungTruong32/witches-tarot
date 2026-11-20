// Hành vi chung của menu/hộp thoại/ảnh phóng to: Esc để đóng, đóng xong trả focus về chỗ đã mở.
// (Bản cũ không có cả hai — đây là cải tiến có chủ ý.)
import { useEffect, useRef } from 'react';

export function useOverlay(open: boolean, onClose: () => void): void {
  const opener = useRef<Element | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, [open]);
}

