// Tuần trăng tính cục bộ theo tháng giao hội (không cần API) và hình SVG của pha trăng.

export interface MoonPhase {
  /** emoji */ e: string;
  /** tên pha (VI) */ n: string;
  /** gợi ý (VI) */ h: string;
  /** % sáng 0–100 */ illum: number;
  /** tuổi trăng (ngày, làm tròn) */ age: number;
  /** 0 = trăng non, 0.5 = rằm */ frac: number;
  waxing: boolean;
}

const SYN = 29.530588853; // độ dài tháng giao hội (ngày)
const REF = Date.UTC(2000, 0, 6, 18, 14, 0); // trăng non 6/1/2000 18:14 UTC

export function moonPhase(date: Date): MoonPhase {
  const days = (date.getTime() - REF) / 86400000;
  let age = days % SYN;
  if (age < 0) age += SYN;
  const frac = age / SYN;
  const illum = Math.round(((1 - Math.cos(2 * Math.PI * frac)) / 2) * 100);
  const waxing = frac < 0.5;
  // Chọn nhãn theo % sáng để tên–biểu tượng–% luôn khớp nhau
  let p: Pick<MoonPhase, 'e' | 'n' | 'h'>;
  if (illum < 2) p = { e: '🌑', n: 'Trăng non', h: 'Khởi đầu, gieo ý định mới.' };
  else if (illum > 98) p = { e: '🌕', n: 'Trăng tròn (rằm)', h: 'Đỉnh năng lượng, chiêm nghiệm & buông bỏ.' };
  else if (illum >= 46 && illum <= 55)
    p = waxing
      ? { e: '🌓', n: 'Bán nguyệt đầu', h: 'Quyết định, vượt trở ngại.' }
      : { e: '🌗', n: 'Bán nguyệt cuối', h: 'Buông những gì không còn phù hợp.' };
  else if (illum < 46)
    p = waxing
      ? { e: '🌒', n: 'Trăng lưỡi liềm đầu', h: 'Nuôi dưỡng dự định, hành động nhỏ.' }
      : { e: '🌘', n: 'Trăng tàn', h: 'Nghỉ ngơi, hồi phục trước chu kỳ mới.' };
  else
    p = waxing
      ? { e: '🌔', n: 'Trăng khuyết đầu (lồi)', h: 'Tinh chỉnh, kiên trì tới đích.' }
      : { e: '🌖', n: 'Trăng khuyết cuối (lồi)', h: 'Biết ơn, chia sẻ thành quả.' };
  return { ...p, illum, age: Math.round(age), frac, waxing };
}

let defaultSeq = 0;
const nextDefaultId = () => ++defaultSeq;

/**
 * SVG pha trăng: đĩa tối + phần sáng có đường ranh (terminator) đúng theo pha, vành vàng, miệng hố, sao nhỏ.
 * `idSeq` cấp số cho id gradient/clip (mỗi SVG trên trang cần id riêng).
 */
export function moonSvg(frac: number, cls?: string, idSeq: () => number = nextDefaultId): string {
  const id = 'mn' + idSeq();
  const c = 32;
  const R = 17;
  const k = Math.cos(2 * Math.PI * frac); // 1 = trăng non, -1 = rằm
  const rx = (R * Math.abs(k)).toFixed(2);
  const waxing = frac < 0.5;
  const crescent = k > 0; // sáng < 50%
  // Nửa vành sáng (bên phải khi trăng lên, bên trái khi trăng tàn) + cung ranh quay về đỉnh
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  const lit = `M${c} ${c - R}A${R} ${R} 0 0 ${limbSweep} ${c} ${c + R}A${rx} ${R} 0 0 ${termSweep} ${c} ${c - R}Z`;
  const showLit = (frac > 0.012 && frac < 0.988) || Math.abs(k) < 0.999;
  const full = Math.abs(k + 1) < 0.004;
  const craters =
    '<circle cx="27" cy="25" r="3.2"/><circle cx="38" cy="36" r="4.2"/><circle cx="30" cy="40" r="2.2"/><circle cx="40" cy="24" r="1.8"/><circle cx="24" cy="34" r="1.6"/>';
  const star = (x: number, y: number, r: number) =>
    `<path d="M${x} ${y - r}Q${x + r * 0.25} ${y - r * 0.25} ${x + r} ${y}Q${x + r * 0.25} ${y + r * 0.25} ${x} ${y + r}Q${x - r * 0.25} ${y + r * 0.25} ${x - r} ${y}Q${x - r * 0.25} ${y - r * 0.25} ${x} ${y - r}Z"/>`;
  return (
    `<svg class="${cls || 'moon-svg'}" viewBox="0 0 64 64" aria-hidden="true">` +
    `<defs><radialGradient id="${id}d" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#3b3160"/><stop offset="1" stop-color="#17112b"/></radialGradient>` +
    `<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff9ee"/><stop offset=".6" stop-color="#f6dcb2"/><stop offset="1" stop-color="#e3b27c"/></linearGradient>` +
    `<clipPath id="${id}c"><path d="${full ? `M${c} ${c - R}a${R} ${R} 0 1 1 0 ${2 * R}a${R} ${R} 0 1 1 0 ${-2 * R}Z` : lit}"/></clipPath></defs>` +
    `<circle cx="${c}" cy="${c}" r="27" fill="none" stroke="var(--spark)" stroke-width=".7" stroke-dasharray="1.5 2.6" opacity=".55"/>` +
    `<circle cx="${c}" cy="${c}" r="${R + 4}" fill="var(--spark)" opacity=".10"/>` +
    `<circle cx="${c}" cy="${c}" r="${R}" fill="url(#${id}d)"/>` +
    (showLit || full
      ? `<g clip-path="url(#${id}c)"><rect width="64" height="64" fill="url(#${id}l)"/><g fill="#c99a6a" opacity=".22">${craters}</g></g>`
      : '') +
    `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--spark)" stroke-width="1.1" opacity=".85"/>` +
    `<g fill="var(--spark)">${star(55, 11, 4)}${star(9, 50, 2.6)}<circle cx="53" cy="49" r="1.2"/><circle cx="12" cy="14" r="1"/></g>` +
    `</svg>`
  );
}
