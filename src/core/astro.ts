// Thiên văn: vị trí Mặt Trời/Trăng/hành tinh (thuật toán Schlyter, ~vài phút cung) và phép chiếu bầu trời.
// Số học giữ NGUYÊN như bản cũ (celestialBodies + skyvCompute/computeSky) để kết quả trùng từng bit.
// Bản cũ viết phép chiếu 2 lần (bản đồ sao & nền sao) — hai bản giống hệt nhau về công thức, chỉ khác bán kính R.

export interface Body { name: string; ra: number; dec: number; kind: 'sun' | 'moon' | 'planet'; color: string; size: number; illum?: number; waxing?: boolean }

const RD = Math.PI / 180;
const sind = (x: number) => Math.sin(x * RD);
const cosd = (x: number) => Math.cos(x * RD);
const atan2d = (y: number, x: number) => Math.atan2(y, x) / RD;
const rev = (x: number) => ((x % 360) + 360) % 360;

/** Ngày Julian từ Date (UTC). */
export function julianDay(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

// hoàng đạo → xích đạo → [ra, dec] độ
function eclToEq(x: number, y: number, z: number, obl: number): [number, number] {
  const o = obl * RD;
  const ye = y * Math.cos(o) - z * Math.sin(o);
  const ze = y * Math.sin(o) + z * Math.cos(o);
  return [rev(atan2d(ye, x)), atan2d(ze, Math.sqrt(x * x + ye * ye))];
}

// giải phương trình Kepler (độ)
function eccAnom(M: number, e: number): number {
  let E = M + e * (180 / Math.PI) * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 3; k++) E = E - (E - e * (180 / Math.PI) * sind(E) - M) / (1 - e * cosd(E));
  return E;
}

/** Mặt Trời, Mặt Trăng và 5 hành tinh (địa tâm) tại jd: ra/dec tính bằng độ. */
export function celestialBodies(jd: number): Body[] {
  const d = jd - 2451543.5;
  const obl = 23.4393 - 3.563e-7 * d;
  // Mặt Trời
  const ws = 282.9404 + 4.70935e-5 * d, es = 0.016709 - 1.151e-9 * d, Ms = rev(356.0470 + 0.9856002585 * d);
  const Es = eccAnom(Ms, es);
  const xvs = cosd(Es) - es, yvs = Math.sqrt(1 - es * es) * sind(Es);
  const lonsun = rev(atan2d(yvs, xvs) + ws), rs = Math.sqrt(xvs * xvs + yvs * yvs);
  const xs = rs * cosd(lonsun), ys = rs * sind(lonsun);
  const out: Body[] = [];
  const sunEq = eclToEq(xs, ys, 0, obl);
  out.push({ name: 'Mặt Trời', ra: sunEq[0], dec: sunEq[1], kind: 'sun', color: '#ffd66b', size: 9 });
  // Mặt Trăng (địa tâm) + nhiễu loạn chính
  {
    const N = rev(125.1228 - 0.0529538083 * d), i = 5.1454, w = rev(318.0634 + 0.1643573223 * d);
    const a = 60.2666, e = 0.054900, M = rev(115.3654 + 13.0649929509 * d);
    const E = eccAnom(M, e);
    const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
    const v = atan2d(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
    const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
    const zh = r * (sind(v + w) * sind(i));
    let lon = atan2d(yh, xh), lat = atan2d(zh, Math.sqrt(xh * xh + yh * yh));
    const Ls = rev(ws + Ms), Lm = rev(N + w + M), Dm = rev(Lm - Ls), F = rev(Lm - N);
    lon += -1.274 * sind(M - 2 * Dm) + 0.658 * sind(2 * Dm) - 0.186 * sind(Ms) - 0.059 * sind(2 * M - 2 * Dm)
      - 0.057 * sind(M - 2 * Dm + Ms) + 0.053 * sind(M + 2 * Dm) + 0.046 * sind(2 * Dm - Ms)
      + 0.041 * sind(M - Ms) - 0.035 * sind(Dm) - 0.031 * sind(M + Ms) - 0.015 * sind(2 * F - 2 * Dm) + 0.011 * sind(M - 4 * Dm);
    lat += -0.173 * sind(F - 2 * Dm) - 0.055 * sind(M - F - 2 * Dm) - 0.046 * sind(M + F - 2 * Dm)
      + 0.033 * sind(F + 2 * Dm) + 0.017 * sind(2 * M + F);
    const xg = cosd(lat) * cosd(lon), yg = cosd(lat) * sind(lon), zg = sind(lat);
    const eq = eclToEq(xg, yg, zg, obl);
    const elong = rev(lon - lonsun);
    out.push({ name: 'Mặt Trăng', ra: eq[0], dec: eq[1], kind: 'moon', color: '#eae6d5', size: 10, illum: Math.round((1 - cosd(elong)) / 2 * 100), waxing: elong < 180 });
  }
  // Hành tinh (địa tâm = nhật tâm + Mặt Trời)
  const PL = [
    { name: 'Sao Thủy', c: '#c9b8a0', N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: rev(168.6562 + 4.0923344368 * d) },
    { name: 'Sao Kim', c: '#fff4d6', N: 76.6799 + 2.46590e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.8910 + 1.38374e-5 * d, a: 0.723330, e: 0.006773 - 1.302e-9 * d, M: rev(48.0052 + 1.6021302244 * d) },
    { name: 'Sao Hỏa', c: '#ff7b5a', N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: rev(18.6021 + 0.5240207766 * d) },
    { name: 'Sao Mộc', c: '#e9d9b0', N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: rev(19.8950 + 0.0830853001 * d) },
    { name: 'Sao Thổ', c: '#f0d98a', N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: rev(316.9670 + 0.0334442282 * d) },
  ];
  for (const p of PL) {
    const E = eccAnom(p.M, p.e);
    const xv = p.a * (cosd(E) - p.e), yv = p.a * Math.sqrt(1 - p.e * p.e) * sind(E);
    const v = atan2d(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    const xh = r * (cosd(p.N) * cosd(v + p.w) - sind(p.N) * sind(v + p.w) * cosd(p.i));
    const yh = r * (sind(p.N) * cosd(v + p.w) + cosd(p.N) * sind(v + p.w) * cosd(p.i));
    const zh = r * (sind(v + p.w) * sind(p.i));
    const eq = eclToEq(xh + xs, yh + ys, zh, obl);
    out.push({ name: p.name, ra: eq[0], dec: eq[1], kind: 'planet', color: p.c, size: p.name === 'Sao Kim' || p.name === 'Sao Mộc' ? 4.5 : 3.6 });
  }
  return out;
}

/** Giờ thiên văn địa phương (độ, 0–360) tại kinh độ lonDeg (Đông dương). */
export function localSiderealDeg(jd: number, lonDeg: number): number {
  const D = jd - 2451545.0; // JD - J2000
  let gmst = (280.46061837 + 360.98564736629 * D) % 360; if (gmst < 0) gmst += 360;
  let lst = (gmst + lonDeg) % 360; if (lst < 0) lst += 360;
  return lst;
}

/**
 * RA/Dec (độ) → độ cao & phương vị, đơn vị RADIAN (giữ nguyên số học bản cũ để khỏi mất chính xác).
 * az tính từ Nam, dương về phía Tây (nhân cosD để tránh tanδ gần cực). alt <= 0: dưới chân trời.
 */
export function altAz(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): { alt: number; az: number } {
  const rad = Math.PI / 180, phi = latDeg * rad, sinP = Math.sin(phi), cosP = Math.cos(phi);
  const Hh = (lstDeg - raDeg) * rad, d = decDeg * rad, sinD = Math.sin(d), cosD = Math.cos(d), cosH = Math.cos(Hh), sinH = Math.sin(Hh);
  const sinAlt = Math.max(-1, Math.min(1, sinP * sinD + cosP * cosD * cosH)), alt = Math.asin(sinAlt);
  const az = Math.atan2(sinH * cosD, cosH * sinP * cosD - sinD * cosP);
  return { alt, az };
}

/**
 * Phép chiếu vòm (thiên đỉnh ở tâm cx,cy; bán kính chân trời R): trả {x,y} hoặc null nếu dưới chân trời.
 * y = cy + r·cosA: Bắc trên, Nam dưới, Đông trái, Tây phải. Dùng chung cho bản đồ sao (R = 0.46·min(W,H)·zoom)
 * và nền sao (R = 0.62·max(W,H)).
 */
export function skyProject(raDeg: number, decDeg: number, latDeg: number, lstDeg: number, R: number, cx: number, cy: number): { x: number; y: number } | null {
  const { alt, az } = altAz(raDeg, decDeg, latDeg, lstDeg);
  if (alt <= 0) return null;
  const r = (1 - alt / (Math.PI / 2)) * R;
  return { x: cx + r * Math.sin(az), y: cy + r * Math.cos(az) };
}
