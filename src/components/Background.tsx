// Nền động toàn màn hình: #bgAura + canvas#bgStars (bản cũ L834–835), chạy engine starfield, gắn window.tarotBurst.
import { useLayoutEffect, useRef } from 'react';
import { useApp } from '../app/store';
import { startStarfield, type Starfield, type StarfieldOpts } from '../engines/starfield';
import { prefersReducedMotion } from '../lib/media';

type BurstWin = { tarotBurst?: (x: number, y: number, n: number) => void };

/** Màu sao/hạt theo theme hiện tại (CSS --star/--spark); trống thì dùng màu mặc định của bản cũ. */
function readColors(): StarfieldOpts['colors'] {
  const cs = getComputedStyle(document.documentElement);
  return { star: cs.getPropertyValue('--star').trim() || '#e9e3ff', spark: cs.getPropertyValue('--spark').trim() || '#ffe1a8' };
}

export function Background() {
  const fx = useApp(s => s.prefs.fx);
  const skyMode = useApp(s => s.prefs.skyMode);
  const skyCity = useApp(s => s.prefs.skyCity);
  const theme = useApp(s => s.prefs.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Starfield | null>(null);
  const reduceRef = useRef(prefersReducedMotion());   // như bản cũ: đọc một lần khi khởi động

  // Gắn engine một lần; gỡ thì dừng rAF + bỏ listener + xoá tarotBurst
  useLayoutEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const s = useApp.getState().prefs;
    const engine = startStarfield(cv, { fx: s.fx, skyMode: s.skyMode, skyCity: s.skyCity, reduce: reduceRef.current, colors: readColors() });
    engineRef.current = engine;
    (window as BurstWin).tarotBurst = (x, y, n) => engine.burst(x, y, n);
    return () => {
      engine.stop();
      engineRef.current = null;
      delete (window as BurstWin).tarotBurst;
    };
  }, []);

  // Cài đặt đổi → cập nhật engine. Layout effect của RootAttrs (đứng trước) đã áp data-theme → --star/--spark đọc được đúng theme mới.
  useLayoutEffect(() => {
    engineRef.current?.update({ fx, skyMode, skyCity, reduce: reduceRef.current, colors: readColors() });
  }, [fx, skyMode, skyCity, theme]);

  return (
    <>
      <div id="bgAura"></div>
      <canvas id="bgStars" ref={canvasRef}></canvas>
    </>
  );
}
