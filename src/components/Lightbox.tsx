// Phóng to ảnh lá bài (bấm ra ngoài hoặc Esc để đóng). Lá ngược thì xoay 180°.
import { useApp } from '../app/store';
import { useOverlay } from './useOverlay';

export function Lightbox() {
  const lb = useApp(s => s.lightbox);
  const close = useApp(s => s.closeLightbox);
  useOverlay(!!lb, close);
  return (
    <div className={'lightbox' + (lb ? ' open' : '')} id="imgLightbox" onClick={close}>
      <img id="lightboxImg" alt="" src={lb?.url} className={lb?.reversed ? 'flip' : undefined} />
    </div>
  );
}
