// Bung hạt lấp lánh tại tâm một phần tử (bản cũ L2118). Starfield (Plan 2c) gắn window.tarotBurst; chưa có thì bỏ qua.
export function burstAt(el: Element | null | undefined, n: number): void {
  const fn = (window as unknown as { tarotBurst?: (x: number, y: number, n: number) => void }).tarotBurst;
  if (!el || !fn) return;
  const r = el.getBoundingClientRect();
  fn(r.left + r.width / 2, r.top + r.height / 2, n);
}

/** Rung nhẹ trên điện thoại; trình duyệt không hỗ trợ thì bỏ qua. */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms || 12);
  } catch {
    /* không hỗ trợ */
  }
}
