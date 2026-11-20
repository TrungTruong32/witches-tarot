// Nền động toàn màn hình: #bgAura + canvas#bgStars (bản cũ L834–835), chạy engine starfield, gắn window.tarotBurst.
import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../app/store';
import { startStarfield, type Starfield } from '../engines/starfield';
import { prefersReducedMotion } from '../lib/media';
import { readColors } from '../lib/themeColors';

type BurstWin = { tarotBurst?: (x: number, y: number, n: number) => void };

export function Background() {
  const fx = useApp(s => s.prefs.fx);
  const skyMode = useApp(s => s.prefs.skyMode);
  const skyCity = useApp(s => s.prefs.skyCity);
  const theme = useApp(s => s.prefs.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Starfield | null>(null);
  const [reduce] = useState(prefersReducedMotion);   // như bản cũ: đọc một lần khi khởi động (lazy, không gọi lại mỗi lần render)

  // Gắn engine một lần; gỡ thì dừng rAF + bỏ listener + xoá tarotBurst
  useLayoutEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const s = useApp.getState().prefs;
    const engine = startStarfield(cv, { fx: s.fx, skyMode: s.skyMode, skyCity: s.skyCity, reduce, colors: readColors() });
    engineRef.current = engine;
    (window as BurstWin).tarotBurst = (x, y, n) => engine.burst(x, y, n);
    return () => {
      engine.stop();
      engineRef.current = null;
      delete (window as BurstWin).tarotBurst;
    };
  }, [reduce]);

  // Cài đặt đổi → cập nhật engine. Layout effect của RootAttrs (đứng trước) đã áp data-theme → --star/--spark đọc được đúng theme mới.
  useLayoutEffect(() => {
    engineRef.current?.update({ fx, skyMode, skyCity, reduce, colors: readColors() });
  }, [fx, skyMode, skyCity, theme, reduce]);

  return (
    <>
      <div id="bgAura"></div>
      <canvas id="bgStars" ref={canvasRef}></canvas>
    </>
  );
}
