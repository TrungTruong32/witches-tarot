// Quạt bài trang trí ở đáy trang mở đầu: lá to dần theo màn hình, đủ lá để phủ kín cung
// (15 lá trên điện thoại → tới 41 lá trên màn lớn). Công thức của layoutLandingFan bản cũ.

export interface FanLayout {
  /** bề rộng lá (px) */ cw: number;
  /** bán kính trục quay nằm sâu dưới đáy (px, đã làm tròn) */ R: number;
  /** góc (--a, độ) và độ trễ animation (--dl, giây) của từng lá, dạng chuỗi như CSS cũ */
  cards: { a: string; dl: string }[];
}

export function layoutFan(width: number): FanLayout {
  const cw = Math.round(Math.max(54, Math.min(118, width * 0.072)));
  const R = Math.max(420, width * 0.95);
  const half = (Math.asin(Math.min(0.97, (width * 0.5 - cw * 0.2) / (R + cw * 1.1))) * 180) / Math.PI; // nửa góc xoè
  const arc = ((2 * half * Math.PI) / 180) * (R + cw);
  const n = Math.max(15, Math.min(41, Math.round(arc / (cw * 0.48)) | 1)); // lá chồng ~52%, số lẻ
  const cards = Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    return { a: (t * 2 * half).toFixed(2), dl: (-i * 0.37).toFixed(2) };
  });
  return { cw, R: Math.round(R), cards };
}

/** Màn thấp: hạ quạt xuống để không lấn lên nút "Bốc bài" / "Bỏ qua câu hỏi". */
export function fanDrop(cw: number, viewportHeight: number, skipBottom: number | null): number {
  if (skipBottom == null) return 0;
  const show = cw * 1.75 * 0.62; // phần lá giữa ló lên khi chưa hạ
  const room = viewportHeight - skipBottom - 18; // khoảng trống dưới nút
  return Math.max(0, Math.min(show - 24, show - room));
}
