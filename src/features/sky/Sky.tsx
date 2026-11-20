// Màn "Bầu trời" (port từ witches_tarot.html: markup L1126–1152, initSkyView/skyStart/skyStop L5124–5325).
// Vẽ + cử chỉ ở engines/skyMap.ts; ở đây là nút điều khiển, vị trí/GPS, lớp hiển thị, toàn màn hình và #skyInfo.
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { useApp } from '../../app/store';
import { readColors } from '../../components/Background';
import { DEFAULT_SKY_LAYERS, SKY_CITIES, startSkyMap, type SkyLayers, type SkyMap } from '../../engines/skyMap';
import { pickLang, useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';
import { getJson, getStr, KEYS, setStr } from '../../services/storage';

const LOCS = ['hcm', 'hanoi', 'danang', 'cantho', 'gps'];
const HCM = SKY_CITIES.hcm!;

/** Chữ trong #skyInfo: chuỗi engine báo (đã theo ngôn ngữ) hoặc cặp VI/EN của trạng thái GPS / toàn màn hình. */
type Info = string | { vi: string; en: string };

const GPS_ASK = { vi: 'Đang xin vị trí…', en: 'Requesting location…' };
const GPS_DENIED = { vi: 'Bị từ chối định vị — hãy chọn một thành phố.', en: 'Location denied — pick a city instead.' };
const GPS_NONE = { vi: 'Thiết bị không hỗ trợ định vị.', en: 'Geolocation not supported.' };
const FS_NONE = { vi: 'Thiết bị không hỗ trợ toàn màn hình.', en: 'Fullscreen not supported on this device.' };
const GPS_NAME = { vi: 'vị trí của bạn', en: 'your location' };

/** Nơi đã lưu (chỉ nhận giá trị có trong danh sách), mặc định TP.HCM. */
function savedLoc(): string {
  const v = getStr(KEYS.skyLoc, '');
  return LOCS.includes(v) ? v : 'hcm';
}
/** Lớp đã lưu gộp lên mặc định — giữ thứ tự khoá {lines, grid, bodies, starsOnly} như bản cũ. */
function savedLayers(): SkyLayers {
  const s = getJson<Partial<SkyLayers> | null>(KEYS.skyLayers, {});
  return { ...DEFAULT_SKY_LAYERS, ...(s && typeof s === 'object' ? s : {}) };
}

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function Sky() {
  const { t, pick, lang } = useT();
  const theme = useApp(s => s.prefs.theme);
  const [loc, setLoc] = useState(savedLoc);
  const [layers, setLayers] = useState(savedLayers);
  const [info, setInfo] = useState<Info>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SkyMap | null>(null);
  const layersRef = useRef(layers);

  // Vào màn hình: chạy engine (skyStart); rời màn hình: dừng rAF + gỡ mọi listener (skyStop)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    // bản cũ: giá trị 'gps' đã lưu không tự xin vị trí lại → vẫn vẽ TP.HCM
    const c = SKY_CITIES[savedLoc()] ?? HCM;
    const engine = startSkyMap(
      cv,
      { lat: c[0], lon: c[1], name: c[2], layers: layersRef.current, lang: useApp.getState().lang, reduce: prefersReducedMotion(), colors: readColors() },
      { onInfo: setInfo },
    );
    engineRef.current = engine;
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => { engineRef.current?.setLang(lang); }, [lang]);
  // đổi theme khi đang ở màn này → màu sao (--star) theo theme mới; RootAttrs đã áp data-theme trước
  useLayoutEffect(() => { engineRef.current?.setColors(readColors()); }, [theme]);

  function onLoc(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const engine = engineRef.current;
    setLoc(v);
    engine?.clearSelection();
    setStr(KEYS.skyLoc, v);
    if (v === 'gps') {
      setInfo(GPS_ASK);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => engineRef.current?.setLocation(pos.coords.latitude, pos.coords.longitude, pickLang(useApp.getState().lang, GPS_NAME)),
          () => setInfo(GPS_DENIED),
        );
      } else setInfo(GPS_NONE);
    } else {
      const c = SKY_CITIES[v];
      if (c) engine?.setLocation(c[0], c[1], c[2]);
    }
  }

  function toggle(k: keyof SkyLayers) {
    const next = { ...layers, [k]: !layers[k] };
    layersRef.current = next;
    setLayers(next);
    setStr(KEYS.skyLayers, JSON.stringify(next));
    engineRef.current?.setLayers(next);
  }

  function fullscreen() {
    const st = stageRef.current as FsEl | null;
    if (!st) return;
    const d = document as FsDoc;
    const fsEl = d.fullscreenElement || d.webkitFullscreenElement;
    if (fsEl) {
      const exit = d.exitFullscreen || d.webkitExitFullscreen;
      void Promise.resolve(exit?.call(d)).catch(() => {});
    } else if (st.requestFullscreen) void Promise.resolve(st.requestFullscreen()).catch(() => {});
    else if (st.webkitRequestFullscreen) st.webkitRequestFullscreen();
    else setInfo(FS_NONE);
  }

  const tg = (on: boolean) => 'sky-tg' + (on ? ' on' : '');

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{t('sky.head')}</h3>
      <div className="sky-controls">
        <label htmlFor="skyLoc">{t('sky.location')}</label>
        <select id="skyLoc" value={loc} onChange={onLoc}>
          <option value="hcm">TP.HCM</option>
          <option value="hanoi">Hà Nội</option>
          <option value="danang">Đà Nẵng</option>
          <option value="cantho">Cần Thơ</option>
          <option value="gps">{t('sky.gps')}</option>
        </select>
        <button id="skyResetView" onClick={() => engineRef.current?.reset()}>{t('sky.reset')}</button>
      </div>
      <div className="sky-controls" style={{ marginTop: 8 }}>
        <button id="skyZoomOut" title="Thu nhỏ" onClick={() => engineRef.current?.zoomBy(1 / 1.2)}>－</button>
        <button id="skyZoomIn" title="Phóng to" onClick={() => engineRef.current?.zoomBy(1.2)}>＋</button>
        <button id="skyTgLines" className={tg(layers.lines)} onClick={() => toggle('lines')}>{t('sky.lines')}</button>
        <button id="skyTgGrid" className={tg(layers.grid)} onClick={() => toggle('grid')}>{t('sky.grid')}</button>
        <button id="skyTgBodies" className={tg(layers.bodies)} onClick={() => toggle('bodies')}>{t('sky.planets')}</button>
        <button id="skyTgStars" className={tg(layers.starsOnly)} onClick={() => toggle('starsOnly')}>{t('sky.starsonly')}</button>
        <button id="skyFull" title="Toàn màn hình" onClick={fullscreen}>{t('sky.full')}</button>
      </div>
      <div className="ai-hint" id="skyInfo" style={{ margin: '10px 0' }}>{typeof info === 'string' ? info : pick(info)}</div>
      <div className="sky-stage" ref={stageRef}><canvas id="skyCanvas" ref={canvasRef}></canvas></div>
    </div>
  );
}
