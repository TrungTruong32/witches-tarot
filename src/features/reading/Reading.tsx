// Màn "Trải bài AI": hai cột (lưới .reading, CSS bản cũ) — bước 1–4 bên trái, lời giải bên phải (markup L986–1075).
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../app/store';
import { ResultPanel } from './ResultPanel';
import { loadSharedHash } from './share';
import { Steps } from './Steps';

/** Link chia sẻ `#r=...`: nạp khi DB sẵn sàng, mỗi hash một lần (loadSharedFromHash chạy lúc khởi động ở bản cũ, L5519). */
function useSharedHash() {
  const { hash } = useLocation();
  const ready = useApp(s => s.dbStatus === 'ready');
  useEffect(() => {
    if (!ready || !hash.startsWith('#r=')) return;
    // Chỉ ghi vào store toàn cục → không cần huỷ khi rời màn
    loadSharedHash(hash).catch(e => console.warn('Link chia sẻ lỗi', e));
  }, [hash, ready]);
}

export function Reading() {
  useSharedHash();
  return (
    <div className="reading">
      <Steps />
      <ResultPanel />
    </div>
  );
}
