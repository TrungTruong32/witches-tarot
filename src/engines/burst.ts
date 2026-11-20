// Bung hạt lấp lánh tại tâm một phần tử (bản cũ L2118: window.tarotBurst). Nơi vẽ hạt do <Background/> đăng ký
// (setBurstSink → engines/starfield) thay cho biến toàn cục; chưa đăng ký thì bỏ qua.
export type BurstSink = (x: number, y: number, n: number) => void;

let sink: BurstSink | null = null;

/** Đăng ký nơi vẽ hạt (null = gỡ). Chỉ một nơi tại một thời điểm. */
export function setBurstSink(fn: BurstSink | null): void {
  sink = fn;
}

export function burstAt(el: Element | null | undefined, n: number): void {
  if (!el || !sink) return;
  const r = el.getBoundingClientRect();
  sink(r.left + r.width / 2, r.top + r.height / 2, n);
}

/** Rung nhẹ trên điện thoại; trình duyệt không hỗ trợ thì bỏ qua. */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms || 12);
  } catch {
    /* không hỗ trợ */
  }
}
