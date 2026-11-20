// Bản đồ sao tương tác của màn "Bầu trời" (bản cũ L5124–5325): kéo để xoay, chụm/lăn để phóng, chạm để chọn sao.
// Phép chiếu dùng chung core/astro (skyProject) — không có bản sao thứ hai của toán. Không dùng computeSkyScene của nền
// (bảng thành phố, R, cỡ sao khác và không có chòm/tên).
// Khác bản cũ (phán quyết): sky.json lỗi → báo chữ lỗi qua onInfo (bản cũ im lặng); đổi nơi khi đang lỗi thì tải lại.
import { celestialBodies, julianDay, localSiderealDeg, skyProject, type Body } from '../core/astro';
import type { Lang } from '../core/types';
import { loadSky, type SkyData } from '../services/skyData';

/** [vĩ độ, kinh độ, tên] — SKY_CITIES của bản cũ (có Cần Thơ, khác bảng của nền). */
export const SKY_CITIES: Record<string, [number, number, string]> = {
  hcm: [10.82, 106.63, 'TP.HCM'],
  hanoi: [21.03, 105.85, 'Hà Nội'],
  danang: [16.05, 108.22, 'Đà Nẵng'],
  cantho: [10.03, 105.78, 'Cần Thơ'],
};

/** Lớp hiển thị — đúng thứ tự khoá của JSON `tarotSkyLayers` bản cũ. */
export interface SkyLayers { lines: boolean; grid: boolean; bodies: boolean; starsOnly: boolean }
export const DEFAULT_SKY_LAYERS: SkyLayers = { lines: true, grid: false, bodies: true, starsOnly: false };

export interface SkyMapOpts {
  lat: number;
  lon: number;
  /** Tên nơi hiện trong chữ hướng dẫn (#skyInfo). */
  name: string;
  layers: SkyLayers;
  lang: Lang;
  /** Như bản cũ: bản đồ sao vẫn lấp lánh khi giảm chuyển động (chỉ nhận để đồng bộ API với nền). */
  reduce: boolean;
  colors: { star: string };
}

export interface SkyMapCallbacks { onInfo(text: string): void }

export interface SkyMap {
  setLocation(lat: number, lon: number, name: string): void;
  setLayers(l: SkyLayers): void;
  setLang(l: Lang): void;
  setColors(c: { star: string }): void;
  zoomBy(f: number): void;
  reset(): void;
  clearSelection(): void;
  stop(): void;
}

interface SStar { x: number; y: number; sz: number; a: number; ph: number; mag: number; name: string | null }
interface Sel { x: number; y: number; name: string | null; mag: number | null; rr: number; cons: string | null }
type Seg = [number, number, number, number];

const clampZoom = (z: number) => Math.max(0.6, Math.min(2.6, z));

/** Chữ hướng dẫn updateSkyInfo của bản cũ. */
export function skyInfoText(lang: Lang, name: string): string {
  return lang === 'en'
    ? 'Real stars & constellations above ' + name + ' right now. Zenith at centre, horizon at the edge. Drag to rotate, scroll/pinch to zoom.'
    : 'Sao & chòm sao thật trên bầu trời ' + name + ' ngay lúc này. Thiên đỉnh ở giữa, chân trời ở mép. Kéo để xoay, lăn/chụm để phóng to.';
}
/** Bản cũ không có chữ này (catch im lặng) — phán quyết. */
export function skyFailText(lang: Lang): string {
  return lang === 'en' ? "Couldn't load the sky data — check your connection and try again." : 'Không tải được dữ liệu bầu trời — kiểm tra mạng rồi thử lại.';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function startSkyMap(cv: HTMLCanvasElement, opts: SkyMapOpts, cb: SkyMapCallbacks): SkyMap {
  let lat = opts.lat, lon = opts.lon, locName = opts.name, lang = opts.lang;
  let layers: SkyLayers = { ...opts.layers };
  let starCol = opts.colors.star;
  let data: SkyData | null = null, loading = false, failed = false, stopped = false;
  let rot = 0, zoom = 1, computedAt = 0, raf = 0, t = 0;
  let stars: SStar[] = [], segs: Seg[] = [], segsC: Record<string, Seg[]> = {}, labels: { x: number; y: number; t: string }[] = [];
  let bodies: (Body & { x: number; y: number })[] = [], consts: { x: number; y: number; t: string; abbr: string }[] = [];
  let cx = 0, cy = 0, R = 0;
  let nameByKey: Record<string, string> | null = null, sel: Sel | null = null, selConst: string | null = null;

  const info = () => cb.onInfo(failed ? skyFailText(lang) : skyInfoText(lang, locName));

  function load() {
    if (data || loading) return;
    loading = true;
    loadSky().then(
      d => { loading = false; if (stopped) return; data = d; failed = false; computedAt = 0; resize(); compute(); },
      () => { loading = false; if (stopped) return; failed = true; info(); },
    );
  }
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    const d = dpr(), w = cv.clientWidth || 320, h = cv.clientHeight || 420;
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    computedAt = 0;
  }
  function compute() {
    if (!data) return;
    const d = dpr(), W = cv.width / d, H = cv.height / d;
    const now = new Date(), jd = julianDay(now), lst = localSiderealDeg(jd, lon);
    R = 0.46 * Math.min(W, H) * zoom; cx = W / 2; cy = H / 2;
    const proj = (ra: number, dec: number) => skyProject(ra, dec, lat, lst, R, cx, cy);
    if (!nameByKey) { nameByKey = {}; for (const n of (data.names || [])) nameByKey[n[0] + ',' + n[1]] = n[2]; }
    stars = [];
    for (const s of data.stars) { const p = proj(s[0], s[1]); if (p) { const m = s[2]; stars.push({ x: p.x, y: p.y, sz: Math.max(0.6, 2.8 - 0.44 * m), a: Math.max(0.3, 1 - 0.14 * m), ph: (s[0] + s[1] * 3) % 6.28, mag: m, name: nameByKey[s[0] + ',' + s[1]] || null }); } }
    segs = []; segsC = {};
    for (const [ab, poly] of data.lines) {
      for (let i = 0; i < poly.length - 1; i++) {
        const a = proj(poly[i]![0], poly[i]![1]), b = proj(poly[i + 1]![0], poly[i + 1]![1]);
        if (a && b) { const seg: Seg = [a.x, a.y, b.x, b.y]; segs.push(seg); (segsC[ab] || (segsC[ab] = [])).push(seg); }
      }
    }
    labels = []; for (const n of data.names) { const p = proj(n[0], n[1]); if (p) labels.push({ x: p.x, y: p.y, t: n[2] }); }
    bodies = []; for (const b of celestialBodies(jd)) { const p = proj(b.ra, b.dec); if (p) bodies.push({ ...b, x: p.x, y: p.y }); }
    consts = []; if (data.consts) for (const c of data.consts) { const p = proj(c[0], c[1]); if (p) consts.push({ x: p.x, y: p.y, t: c[2], abbr: c[3] }); }
    computedAt = Date.now();
  }

  function draw() {
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const d = dpr(); ctx.setTransform(d, 0, 0, d, 0, 0);
    const W = cv.width / d, H = cv.height / d; ctx.clearRect(0, 0, W, H);
    if (!data) {
      ctx.fillStyle = 'rgba(233,227,255,.6)'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(failed ? skyFailText(lang) : (lang === 'en' ? 'Loading sky…' : 'Đang tải bầu trời…'), W / 2, H / 2);
      ctx.textAlign = 'left'; return;
    }
    const th = rot;
    const rotP = (x: number, y: number) => ({ x: cx + (x - cx) * Math.cos(th) - (y - cy) * Math.sin(th), y: cy + (x - cx) * Math.sin(th) + (y - cy) * Math.cos(th) });
    const so = layers.starsOnly;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(th); ctx.translate(-cx, -cy);
    // Lưới toạ độ (vòng độ cao 30°/60° + tia phương vị mỗi 30°)
    if (layers.grid && !so) {
      ctx.strokeStyle = 'rgba(120,150,220,.18)'; ctx.lineWidth = 1;
      for (const alt of [30, 60]) { const rr = (1 - alt / 90) * R; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.28); ctx.stroke(); }
      for (let a = 0; a < 360; a += 30) { const rad = a * Math.PI / 180; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(rad) * R, cy + Math.cos(rad) * R); ctx.stroke(); }
    }
    ctx.strokeStyle = 'rgba(150,170,235,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.stroke();
    if (layers.lines && !so) {
      ctx.strokeStyle = 'rgba(150,170,235,.22)'; ctx.lineWidth = 1; ctx.beginPath();
      for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke();
    }
    // Nổi bật cả hình chòm sao đang chọn (kể cả khi lớp "Chòm sao" đang tắt)
    const cs = selConst ? segsC[selConst] : undefined;
    if (cs && !so) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,225,168,.98)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(255,220,150,.85)'; ctx.shadowBlur = 9;
      ctx.beginPath(); for (const s of cs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke();
      ctx.fillStyle = 'rgba(255,238,195,.98)';
      for (const s of cs) { ctx.beginPath(); ctx.arc(s[0], s[1], 2.6, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(s[2], s[3], 2.6, 0, 6.28); ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = starCol;
    for (const p of stars) { ctx.globalAlpha = Math.min(1, p.a * (0.7 + 0.3 * Math.sin(t * 2 + p.ph))); ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (layers.bodies && !so) for (const b of bodies) {
      const r = b.size * 1.25; ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = r * 2.4;
      if (b.kind === 'moon') {
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
        ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.28); ctx.clip();
        const f = Math.max(0, Math.min(1, (b.illum || 50) / 100));
        ctx.fillStyle = 'rgba(6,6,18,.9)'; ctx.beginPath(); ctx.arc(b.x + (2 * r * f) * (b.waxing ? -1 : 1), b.y, r, 0, 6.28); ctx.fill(); ctx.restore();
      } else { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.28); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
    // Nhãn dựng thẳng (vị trí đã xoay) để dễ đọc
    ctx.textAlign = 'left';
    if (!so) {
      if (layers.lines) { ctx.font = 'italic 12px Georgia, serif'; ctx.fillStyle = 'rgba(180,200,255,.42)'; for (const c of consts) { if (c.abbr === selConst) continue; const p = rotP(c.x, c.y); ctx.fillText(c.t, p.x, p.y); } }
      if (selConst) { const c = consts.find(x => x.abbr === selConst); if (c) { const p = rotP(c.x, c.y); ctx.font = 'italic 700 14px Georgia, serif'; ctx.fillStyle = 'rgba(255,225,168,.98)'; ctx.fillText(c.t, p.x, p.y); } }
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(233,227,255,.62)';
      for (const l of labels) { const p = rotP(l.x, l.y); ctx.fillText(l.t, p.x + 5, p.y + 3); }
      if (layers.bodies) for (const b of bodies) { const p = rotP(b.x, b.y); ctx.fillStyle = 'rgba(255,240,205,.9)'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(b.name, p.x + b.size * 1.25 + 3, p.y + 3); }
    }
    const dirs: [string, number, number][] = lang === 'en' ? [['N', 0, -1], ['S', 0, 1], ['E', -1, 0], ['W', 1, 0]] : [['B', 0, -1], ['N', 0, 1], ['Đ', -1, 0], ['T', 1, 0]];
    ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,225,168,.92)';
    for (const [t0, dx, dy] of dirs) { const p = rotP(cx + dx * R, cy + dy * R); ctx.fillText(t0, p.x, p.y); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // Sao/thiên thể được chọn: vòng sáng + hộp thông tin
    if (sel) {
      const p = rotP(sel.x, sel.y), rr = (sel.rr || 3);
      const pulse = 2 + Math.sin(t * 4) * 1.5;
      ctx.strokeStyle = 'rgba(255,225,168,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, rr + 6 + pulse, 0, 6.28); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,225,168,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, rr + 12 + pulse, 0, 6.28); ctx.stroke();
      const l1 = sel.name || (lang === 'en' ? 'Unnamed star' : 'Sao chưa đặt tên');
      const l2 = (sel.mag != null ? (lang === 'en' ? 'Mag ' : 'Cấp sáng ') + sel.mag.toFixed(1) : (lang === 'en' ? 'Solar system' : 'Hệ Mặt Trời')) + (sel.cons ? ' · ' + sel.cons : '');
      ctx.font = '700 13px system-ui'; const w1 = ctx.measureText(l1).width; ctx.font = '11px system-ui'; const w2 = ctx.measureText(l2).width;
      const bw = Math.max(w1, w2) + 20, bh = 44; let bx = p.x + 16, by = p.y - bh - 6;
      if (bx + bw > W) bx = p.x - bw - 16;
      if (bx < 4) bx = 4;
      if (by < 4) by = p.y + 16;
      if (by + bh > H) by = H - bh - 4;
      ctx.fillStyle = 'rgba(18,14,32,.94)'; ctx.strokeStyle = 'rgba(255,225,168,.45)'; ctx.lineWidth = 1;
      roundRect(ctx, bx, by, bw, bh, 9); ctx.fill(); ctx.stroke();
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe9b8'; ctx.font = '700 13px system-ui'; ctx.fillText(l1, bx + 10, by + 8);
      ctx.fillStyle = '#c8c2d8'; ctx.font = '11px system-ui'; ctx.fillText(l2, bx + 10, by + 26);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function loop() {
    raf = 0;
    if (stopped) return;
    t += 0.016;
    if (Date.now() - computedAt > 30000) compute();   // thiên thể xoay ~15°/giờ → tính lại mỗi 30s là đủ
    draw();
    raf = requestAnimationFrame(loop);
  }

  // Chạm chọn sao/thiên thể gần nhất; hiện tên + độ sáng + chòm sao
  function pick(clientX: number, clientY: number) {
    if (!data) return;
    const r = cv.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const th = rot, dpx = sx - cx, dpy = sy - cy;   // đưa về toạ độ chưa xoay
    const bx = cx + dpx * Math.cos(th) + dpy * Math.sin(th);
    const by = cy - dpx * Math.sin(th) + dpy * Math.cos(th);
    let best: Sel | null = null, bestD = 20 * 20;
    if (!layers.starsOnly && layers.bodies) for (const b of bodies) { const d = (b.x - bx) ** 2 + (b.y - by) ** 2; if (d < bestD) { bestD = d; best = { x: b.x, y: b.y, name: b.name, mag: null, rr: b.size * 1.25, cons: null }; } }
    for (const s of stars) { const d = (s.x - bx) ** 2 + (s.y - by) ** 2; if (d < bestD) { bestD = d; best = { x: s.x, y: s.y, name: s.name, mag: s.mag, rr: s.sz, cons: null }; } }
    if (best) {   // gắn chòm sao gần nhất (tên + mã) để nối & làm nổi bật cả hình
      let cd = Infinity, cn: string | null = null, cab: string | null = null;
      for (const c of consts) { const d = (c.x - best.x) ** 2 + (c.y - best.y) ** 2; if (d < cd) { cd = d; cn = c.t; cab = c.abbr; } }
      best.cons = cn; selConst = cab;
    } else { selConst = null; }
    sel = best;   // null nếu chạm chỗ trống → bỏ chọn
  }

  // Kéo để xoay + chụm 2 ngón để phóng + chạm để chọn sao
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch = 0, startRot = 0, lastX = 0, downX = 0, downY = 0, moved = 0;
  // phán quyết (sửa lỗi bản cũ): đã chụm 2 ngón trong lượt chạm này → nhấc tay không tính là chạm chọn sao
  let pinched = false;
  const onDown = (e: PointerEvent) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cv.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    cv.classList.add('grabbing');
    if (ptrs.size === 1) { lastX = e.clientX; startRot = rot; downX = e.clientX; downY = e.clientY; moved = 0; pinched = false; }
    else if (ptrs.size === 2) { pinched = true; const a = [...ptrs.values()]; pinch = Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y); }
  };
  const onMove = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { rot = startRot + (e.clientX - lastX) * 0.006; moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY)); }
    else if (ptrs.size === 2) {
      const a = [...ptrs.values()], d = Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y);
      if (pinch) { zoom = clampZoom(zoom * (d / pinch)); sel = null; computedAt = 0; }
      pinch = d;
    }
  };
  const onEnd = (e: PointerEvent) => {
    const wasOne = ptrs.size === 1; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = 0;
    if (ptrs.size === 1) { const p = [...ptrs.values()][0]!; lastX = p.x; startRot = rot; }
    if (!ptrs.size) { cv.classList.remove('grabbing'); if (wasOne && moved < 6 && !pinched) pick(downX, downY); }
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom = clampZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); sel = null; computedAt = 0; };
  const onResize = () => resize();
  const onFs = () => { resize(); compute(); };

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onEnd);
  cv.addEventListener('pointercancel', onEnd);
  cv.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  // skyStart của bản cũ
  load(); resize(); compute(); info(); loop();

  return {
    setLocation(la, lo, name) {
      lat = la; lon = lo; locName = name; sel = null; selConst = null; computedAt = 0;
      if (failed) { failed = false; load(); }
      compute(); info();
    },
    setLayers(l) { layers = { ...l }; },
    setLang(l) { lang = l; info(); },
    setColors(c) { starCol = c.star; },
    zoomBy(f) { zoom = clampZoom(zoom * f); sel = null; computedAt = 0; },
    reset() { rot = 0; zoom = 1; sel = null; selConst = null; computedAt = 0; },
    clearSelection() { sel = null; selConst = null; },
    stop() {
      stopped = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onEnd);
      cv.removeEventListener('pointercancel', onEnd);
      cv.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    },
  };
}
