// Nền động toàn màn hình (bản cũ L5718–5892): sao trang trí hoặc bầu trời thật, hạt lấp lánh theo chuột, sao băng, tarotBurst.
// Khác bản cũ (phán quyết): fx tắt → xoá canvas và DỪNG vòng rAF; tab ẩn cũng dừng; lines của sky.json đọc dạng [abbr, poly].
import { loadSky, type SkyData } from '../services/skyData';
import { drawBody, projectSky, SKY_CITIES, type SkyScene } from './skyScene';

export interface StarfieldOpts {
  fx: 'on' | 'off';
  skyMode: string;
  skyCity: string;
  reduce: boolean;
  colors: { star: string; spark: string };
}

export interface Starfield {
  update(opts: StarfieldOpts): void;
  burst(x: number, y: number, n?: number): void;
  stop(): void;
}

// Bầu trời thật theo thời gian thực tại một thành phố VN: nền chỉ nhận ba thành phố trong Cài đặt (lạ, kể cả Cần Thơ → Hà Nội như bản cũ)
const BG_CITIES = ['hanoi', 'danang', 'hcm'];

/** Chiếu sao/đường chòm/tên/thiên thể lên vòm (thiên đỉnh ở tâm, R = 0.62·max(W,H)) — computeSky của bản cũ. */
export function computeSkyScene(sky: SkyData, city: string, date: Date, W: number, H: number): SkyScene {
  const [lat, lon] = SKY_CITIES[BG_CITIES.includes(city) ? city : 'hanoi']!;
  return projectSky(sky, lat, lon, date, {
    R: 0.62 * Math.max(W, H), cx: W / 2, cy: H / 2,
    size: mag => Math.max(0.5, 2.5 - 0.42 * mag),
    alpha: mag => Math.max(0.28, 1 - 0.15 * mag),
    consts: false,
  });
}

interface Star { x: number; y: number; r: number; tw: number; sp: number }
interface Spark { x: number; y: number; life: number; vx: number; vy: number }
interface Meteor { x: number; y: number; vx: number; vy: number; len: number; life: number }

export function startStarfield(cv: HTMLCanvasElement, initial: StarfieldOpts): Starfield {
  let o = { ...initial };
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, t = 0, nextMeteor = 1.2;
  let stars: Star[] = [], sparks: Spark[] = [], meteors: Meteor[] = [];
  let sky: SkyData | null = null, skyLoading = false, skyFailed = false, warned = false;
  let scene: SkyScene | null = null, skyComputedAt = 0;
  let raf: number | null = null, stopped = false;

  function resize() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; skyComputedAt = 0; }
  function initStars() {
    stars = [];
    const n = Math.min(120, Math.round(W * H / 13000));
    for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + .3, tw: Math.random() * 6.28, sp: .5 + Math.random() * 1.3 });
  }
  // Tải sky.json khi vào chế độ thật (không gọi mỗi khung như bản cũ). Lỗi → quay về sao trang trí, cảnh báo một lần.
  function ensureSky() {
    if (sky || skyLoading || skyFailed) return;
    skyLoading = true;
    loadSky().then(
      d => { if (stopped) return; sky = d; skyComputedAt = 0; },
      (e: unknown) => { if (stopped) return; skyFailed = true; if (!warned) { warned = true; console.warn('Không tải được sky.json — dùng sao trang trí', e); } },
    ).finally(() => { skyLoading = false; });
  }

  const onResize = () => { resize(); initStars(); };
  const onMove = (e: MouseEvent) => {
    if (o.reduce || o.fx === 'off') return;
    if (sparks.length < 36 && Math.random() < .45) sparks.push({ x: e.clientX, y: e.clientY, life: 1, vx: (Math.random() - .5) * .6, vy: (Math.random() - .5) * .6 - .25 });
  };
  const onVisibility = () => { if (document.hidden) halt(); else start(); };

  const shouldRun = () => !!ctx && !stopped && o.fx === 'on' && !document.hidden;
  function start() { if (raf === null && shouldRun()) raf = requestAnimationFrame(frame); }
  function halt() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }

  function drawSky(c: CanvasRenderingContext2D, s: SkyScene) {
    c.save();
    // vòng chân trời + la bàn
    if (s.R) {
      c.strokeStyle = 'rgba(150,170,235,.28)'; c.lineWidth = 1;
      c.beginPath(); c.arc(s.cx, s.cy, s.R, 0, 6.28); c.stroke();
      const rl = Math.min(s.R - 6, Math.min(W, H) / 2 - 16);
      c.fillStyle = 'rgba(233,227,255,.7)'; c.font = 'bold 13px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('B', s.cx, s.cy - rl); c.fillText('N', s.cx, s.cy + rl);   // Bắc trên, Nam dưới
      c.fillText('Đ', s.cx - rl, s.cy); c.fillText('T', s.cx + rl, s.cy);   // Đông trái, Tây phải
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    if (s.segs.length) {
      c.strokeStyle = 'rgba(150,170,235,.20)'; c.lineWidth = 1;
      c.beginPath();
      for (const g of s.segs) { c.moveTo(g[0], g[1]); c.lineTo(g[2], g[3]); }
      c.stroke();
    }
    c.fillStyle = o.colors.star;
    for (const p of s.pts) {
      c.globalAlpha = Math.min(1, p.a * (o.reduce ? 1 : (0.7 + 0.3 * Math.sin(t * 2 + p.ph))));
      c.beginPath(); c.arc(p.x, p.y, p.sz, 0, 6.28); c.fill();
    }
    c.globalAlpha = 1;
    if (s.labels.length) {
      c.fillStyle = 'rgba(233,227,255,.5)'; c.font = '11px system-ui, sans-serif';
      for (const l of s.labels) c.fillText(l.t, l.x + 5, l.y + 3);
    }
    // Mặt Trời, Mặt Trăng, hành tinh
    for (const b of s.bodies) {
      drawBody(c, b, b.x, b.y, b.size, 2.2);
      c.fillStyle = 'rgba(255,240,205,.85)'; c.font = '600 11px system-ui, sans-serif';
      c.fillText(b.name, b.x + b.size + 3, b.y + 3);
    }
    c.restore();
  }

  function drawDeco(c: CanvasRenderingContext2D) {
    for (const s of stars) {
      c.globalAlpha = o.reduce ? .45 : (.35 + .4 * Math.sin(t * s.sp + s.tw));
      c.fillStyle = o.colors.star;
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.28); c.fill();
      if (!o.reduce) { s.y += .02; if (s.y > H) s.y = 0; }
    }
  }

  function frame() {
    raf = null;
    const c = ctx!;
    c.clearRect(0, 0, W, H);
    t += .016;
    if (o.skyMode === 'real' && !skyFailed) {
      // ----- Bầu trời thật (đang tải: chưa vẽ sao, như bản cũ) -----
      if (sky) {
        if (!scene || Date.now() - skyComputedAt > 30000) { scene = computeSkyScene(sky, o.skyCity, new Date(), W, H); skyComputedAt = Date.now(); }   // thiên thể xoay ~15°/giờ → tính lại mỗi 30s là đủ
        drawSky(c, scene);
      }
    } else {
      drawDeco(c);   // ----- Sao trang trí ngẫu nhiên -----
    }
    if (!o.reduce) {
      sparks = sparks.filter(p => p.life > 0);
      for (const p of sparks) {
        p.x += p.vx; p.y += p.vy; p.life -= .028;
        c.globalAlpha = Math.max(0, p.life);
        c.fillStyle = o.colors.spark;
        c.beginPath(); c.arc(p.x, p.y, 1.5, 0, 6.28); c.fill();
      }
      // Sao băng: thỉnh thoảng sinh một vệt bay chéo từ trên xuống
      nextMeteor -= .016;
      if (nextMeteor <= 0) {
        nextMeteor = 2.5 + Math.random() * 5;           // cách nhau 2.5–7.5s
        const ang = (Math.PI / 5) + Math.random() * (Math.PI / 7); // ~36°–61° xuống
        const sp = 9 + Math.random() * 6;
        meteors.push({ x: Math.random() * W * 0.9, y: -20, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, len: 90 + Math.random() * 90, life: 1 });
      }
      meteors = meteors.filter(m => m.life > 0 && m.y < H + 60 && m.x < W + 60);
      for (const m of meteors) {
        m.x += m.vx; m.y += m.vy; m.life -= .012;
        const tx = m.x - m.vx * (m.len / 12), ty = m.y - m.vy * (m.len / 12);
        const g = c.createLinearGradient(m.x, m.y, tx, ty);
        const a = Math.max(0, Math.min(1, m.life));
        g.addColorStop(0, o.colors.spark); g.addColorStop(1, 'transparent');
        c.globalAlpha = a;
        c.strokeStyle = g; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(tx, ty); c.stroke();
        c.globalAlpha = a; c.fillStyle = o.colors.spark;
        c.beginPath(); c.arc(m.x, m.y, 1.8, 0, 6.28); c.fill();
      }
    }
    c.globalAlpha = 1;
    start();
  }

  resize(); initStars();
  window.addEventListener('resize', onResize);
  if (!o.reduce) window.addEventListener('mousemove', onMove);
  document.addEventListener('visibilitychange', onVisibility);
  if (o.skyMode === 'real') ensureSky();
  start();

  return {
    update(next) {
      const prev = o;
      o = { ...next };
      if (next.skyCity !== prev.skyCity) skyComputedAt = 0;
      if (next.skyMode === 'real' && prev.skyMode !== 'real') { skyFailed = false; ensureSky(); skyComputedAt = 0; }
      if (o.fx === 'off') { halt(); ctx?.clearRect(0, 0, W, H); }
      else start();
    },
    burst(x, y, n) {
      if (!ctx || o.reduce || o.fx === 'off') return;
      n = n || 16;
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 1.2 + Math.random() * 3.2; sparks.push({ x, y, life: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6 }); }
    },
    stop() {
      stopped = true;
      halt();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
