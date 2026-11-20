// Giao diện chọn kiểu trải + hình học sơ đồ vị trí (port nguyên văn từ witches_tarot.html L2646–2685).
import { CARD_H, type LayoutSlot } from './spreads';

/** Tên ngắn, nhãn & huy hiệu cho ô chọn (vi, en). */
export const SPREAD_UI: Record<string, { n: [string, string]; t: [string, string]; b?: [string, string]; use?: [string, string] }> = {
  free: { n: ['Tự do', 'Free spread'], t: ['Tuỳ ý', 'Any'], use: ['Bốc bao nhiêu lá tuỳ bạn, không gắn vị trí.', 'Draw as many cards as you like, no positions.'] },
  one: { n: ['Một lá', 'One card'], t: ['Nhanh', 'Quick'] },
  ppf: { n: ['Quá khứ · Hiện tại · Tương lai', 'Past · Present · Future'], t: ['Thời gian', 'Timeline'], b: ['Phổ biến', 'Popular'] },
  sao: { n: ['Tình huống · Hành động · Kết quả', 'Situation · Action · Outcome'], t: ['Hành động', 'Action'] },
  mbs: { n: ['Tâm trí · Thể chất · Tinh thần', 'Mind · Body · Spirit'], t: ['Cân bằng', 'Balance'] },
  moon: { n: ['Trăng mới', 'New Moon'], t: ['Ý định', 'Intentions'] },
  sac: { n: ['Phân tích vấn đề', 'Problem analysis'], t: ['Rõ ràng', 'Clarity'] },
  love: { n: ['Mối quan hệ', 'Relationship'], t: ['Tình cảm', 'Love'] },
  choice: { n: ['Hai lựa chọn', 'Two paths'], t: ['Quyết định', 'Decision'] },
  career: { n: ['Công việc & sự nghiệp', 'Work & career'], t: ['Sự nghiệp', 'Career'] },
  horseshoe: { n: ['Móng ngựa', 'Horseshoe'], t: ['Tổng quan', 'Overview'] },
  celtic: { n: ['Celtic Cross', 'Celtic Cross'], t: ['Chuyên sâu', 'Deep dive'], b: ['Kinh điển', 'Classic'] },
  year: { n: ['Năm tới', 'Year ahead'], t: ['12 tháng', '12 months'] },
};

export interface Geom {
  W: number;
  H: number;
  ar: string;
  items: { r: boolean; left: string; top: string; width: string; height: string }[];
}

/** Trải tự do: xếp theo hàng (tối đa 5 lá/hàng). */
export function freeLayout(n: number): LayoutSlot[] {
  const cols = Math.min(Math.max(n, 1), 5);
  return Array.from({ length: n }, (_, i) => [(i % cols) * 1.2, Math.floor(i / cols) * 1.95] as LayoutSlot);
}

/** Hộp bao + vị trí % của từng lá (lá xoay 90° chiếm 1.75 × 1). */
export function layoutGeom(pts: LayoutSlot[]): Geom {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  pts.forEach(([x, y, r]) => {
    const hw = r ? CARD_H / 2 : 0.5, hh = r ? 0.5 : CARD_H / 2;
    x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw); y0 = Math.min(y0, y - hh); y1 = Math.max(y1, y + hh);
  });
  const W = x1 - x0, H = y1 - y0;
  return {
    W, H, ar: (W / H).toFixed(4),
    items: pts.map(([x, y, r]) => ({
      r: !!r,
      left: ((x - 0.5 - x0) / W * 100).toFixed(3) + '%',
      top: ((y - CARD_H / 2 - y0) / H * 100).toFixed(3) + '%',
      width: (1 / W * 100).toFixed(3) + '%',
      height: (CARD_H / H * 100).toFixed(3) + '%',
    })),
  };
}

/** Biến CSS --bw của bàn bài (renderBoard). */
export function boardWidth(g: Geom): string {
  return Math.round(g.W * (g.W <= 1.2 ? 120 : g.W > 4 ? 82 : 96)) + 'px';
}
