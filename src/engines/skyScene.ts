// Dựng cảnh bầu trời dùng chung cho nền (starfield) và bản đồ sao (skyMap): chiếu sao / đường chòm / tên / thiên thể
// lên vòm (thiên đỉnh ở tâm, chân trời ở bán kính R) + vẽ một thiên thể (đĩa phát sáng, Mặt Trăng có bóng theo pha).
// Khác nhau giữa hai engine (R, công thức cỡ/độ sáng sao, có chòm hay không) truyền vào qua tham số — không có bản sao thứ hai của toán.
import { celestialBodies, julianDay, localSiderealDeg, skyProject, type Body } from '../core/astro';
import type { SkyData } from '../services/skyData';

/** [vĩ độ, kinh độ, tên] — SKY_CITIES của bản cũ (bản đồ sao có cả Cần Thơ; nền chỉ nhận ba thành phố đầu, xem starfield). */
export const SKY_CITIES: Record<string, [number, number, string]> = {
  hcm: [10.82, 106.63, 'TP.HCM'],
  hanoi: [21.03, 105.85, 'Hà Nội'],
  danang: [16.05, 108.22, 'Đà Nẵng'],
  cantho: [10.03, 105.78, 'Cần Thơ'],
};

export type Seg = [number, number, number, number];
export interface ScenePoint { x: number; y: number; sz: number; a: number; ph: number; mag: number; name: string | null }
export interface SceneBody extends Body { x: number; y: number }

export interface SkyScene {
  pts: ScenePoint[];
  segs: Seg[];
  /** Đoạn thẳng theo mã chòm (để làm nổi bật cả hình chòm đang chọn). */
  segsByConst: Record<string, Seg[]>;
  labels: { x: number; y: number; t: string }[];
  bodies: SceneBody[];
  consts: { x: number; y: number; t: string; abbr: string }[];
  R: number;
  cx: number;
  cy: number;
}

export interface ProjectOpts {
  /** Bán kính vòng chân trời và tâm vòm (px CSS) — mỗi engine tự tính. */
  R: number;
  cx: number;
  cy: number;
  /** Cỡ chấm sao theo cấp sáng. */
  size(mag: number): number;
  /** Độ sáng cơ sở theo cấp sáng (engine nhân thêm nhịp lấp lánh khi vẽ). */
  alpha(mag: number): number;
  /** Có tính nhãn chòm sao không (nền không vẽ chòm). */
  consts: boolean;
}

/** Tên sao theo toạ độ "ra,dec" — tính một lần cho mỗi bộ dữ liệu. */
const namesCache = new WeakMap<SkyData, Record<string, string>>();
function namesOf(sky: SkyData): Record<string, string> {
  let m = namesCache.get(sky);
  if (!m) {
    m = {};
    for (const n of (sky.names || [])) m[n[0] + ',' + n[1]] = n[2];
    namesCache.set(sky, m);
  }
  return m;
}

/** Chiếu toàn bộ bầu trời tại (lat, lon) lúc `date` — computeSky của bản cũ (nền) và compute của bản đồ sao. */
export function projectSky(sky: SkyData, lat: number, lon: number, date: Date, o: ProjectOpts): SkyScene {
  const { R, cx, cy } = o;
  const jd = julianDay(date);
  const lst = localSiderealDeg(jd, lon);
  const proj = (ra: number, dec: number) => skyProject(ra, dec, lat, lst, R, cx, cy);
  const byKey = namesOf(sky);
  const pts: ScenePoint[] = [];
  for (const s of sky.stars) {
    const p = proj(s[0], s[1]);
    if (p) { const m = s[2]; pts.push({ x: p.x, y: p.y, sz: o.size(m), a: o.alpha(m), ph: (s[0] + s[1] * 3) % 6.28, mag: m, name: byKey[s[0] + ',' + s[1]] || null }); }
  }
  const segs: Seg[] = [], segsByConst: Record<string, Seg[]> = {};
  for (const [ab, poly] of sky.lines) {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = proj(poly[i]![0], poly[i]![1]), b = proj(poly[i + 1]![0], poly[i + 1]![1]);
      if (a && b) { const seg: Seg = [a.x, a.y, b.x, b.y]; segs.push(seg); (segsByConst[ab] || (segsByConst[ab] = [])).push(seg); }
    }
  }
  const labels: SkyScene['labels'] = [];
  for (const n of sky.names) { const p = proj(n[0], n[1]); if (p) labels.push({ x: p.x, y: p.y, t: n[2] }); }
  const bodies: SceneBody[] = [];
  for (const b of celestialBodies(jd)) { const p = proj(b.ra, b.dec); if (p) bodies.push({ ...b, x: p.x, y: p.y }); }
  const consts: SkyScene['consts'] = [];
  if (o.consts && sky.consts) for (const c of sky.consts) { const p = proj(c[0], c[1]); if (p) consts.push({ x: p.x, y: p.y, t: c[2], abbr: c[3] }); }
  return { pts, segs, segsByConst, labels, bodies, consts, R, cx, cy };
}

/** Vẽ một thiên thể tại (x, y) bán kính r, quầng sáng r·glow; Mặt Trăng: đĩa sáng rồi phủ bóng lệch → lộ đúng pha. Không vẽ tên. */
export function drawBody(c: CanvasRenderingContext2D, b: Body, x: number, y: number, r: number, glow: number): void {
  c.save(); c.shadowColor = b.color; c.shadowBlur = r * glow;
  if (b.kind === 'moon') {
    c.fillStyle = b.color; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill();
    c.shadowBlur = 0; c.save(); c.beginPath(); c.arc(x, y, r, 0, 6.28); c.clip();
    const f = Math.max(0, Math.min(1, (b.illum || 50) / 100));
    c.fillStyle = 'rgba(6,6,18,.9)';
    c.beginPath(); c.arc(x + (2 * r * f) * (b.waxing ? -1 : 1), y, r, 0, 6.28); c.fill();
    c.restore();
  } else {
    c.fillStyle = b.color; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill();
  }
  c.restore();
}
