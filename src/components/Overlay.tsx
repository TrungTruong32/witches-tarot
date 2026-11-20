// Hộp thoại dạng .modal-overlay của bản cũ: bấm nền ngoài để đóng, Esc để đóng, đóng xong trả focus.
import type { ReactNode } from 'react';
import { useOverlay } from './useOverlay';

export function ModalOverlay({ id, open, onClose, children }: { id: string; open: boolean; onClose: () => void; children: ReactNode }) {
  useOverlay(open, onClose);
  return (
    <div className={'modal-overlay' + (open ? ' open' : '')} id={id} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">{children}</div>
    </div>
  );
}
