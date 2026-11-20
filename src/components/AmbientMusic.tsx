// Nhạc nền theo prefs.ambientMode / ambientVol (bản cũ L2252–2378). Không vẽ gì; gắn một lần trong Root.
// Trình duyệt chặn audio trước tương tác: nếu mở app khi mode đã bật thì chờ pointerdown/keydown đầu tiên.
// Component giữ engine đang chạy (engines/ambient không có singleton) và luôn dừng nó trước khi bật cái mới.
import { useEffect, useRef } from 'react';
import { useApp } from '../app/store';
import { startAmbient, type AmbientEngine } from '../engines/ambient';
import { ensureAudio } from '../engines/audio';

export function AmbientMusic() {
  const mode = useApp(s => s.prefs.ambientMode);
  const vol = useApp(s => s.prefs.ambientVol);
  const engine = useRef<AmbientEngine | null>(null); // engine đang chạy — chỉ một
  const mountMode = useRef(mode); // mode lúc mở app
  const gesture = useRef(false); // đã có cử chỉ người dùng đầu tiên

  useEffect(() => {
    if (mode === 'off') return;
    const stop = () => {
      engine.current?.stop();
      engine.current = null;
    };
    const begin = () => {
      stop(); // không bao giờ hai scheduler: dừng engine cũ (nếu còn) trước mỗi lần bật
      ensureAudio();
      engine.current = startAmbient(mode, useApp.getState().prefs.ambientVol);
    };
    // Đổi mode trong Cài đặt: cú bấm chính là cử chỉ → bật ngay
    if (gesture.current || mode !== mountMode.current) {
      begin();
      return stop;
    }
    const kick = () => {
      gesture.current = true;
      unlisten();
      begin();
    };
    const unlisten = () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      unlisten();
      stop();
    };
  }, [mode]);

  useEffect(() => {
    engine.current?.setVolume(vol);
  }, [vol]);
  return null;
}
