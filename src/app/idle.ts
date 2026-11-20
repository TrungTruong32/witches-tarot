// Hẹn việc "sau lần vẽ đầu, lúc rảnh": rAF (trước khung hình đầu) → setTimeout 0 (khung đó đã vẽ xong)
// → requestIdleCallback (có hạn chót), trình duyệt không có requestIdleCallback (Safari) thì setTimeout.
export interface IdleHost {
  requestAnimationFrame?: (cb: () => void) => unknown;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => unknown;
  setTimeout: (cb: () => void, ms?: number) => unknown;
}

/** Hạn chót cho requestIdleCallback: trang có hoạt ảnh liên tục (nền sao) hiếm khi "rảnh" hẳn. */
export const IDLE_TIMEOUT_MS = 1000;
/** Không có requestIdleCallback: chờ thêm chút cho trình duyệt xử lý xong việc sau khung đầu. */
export const IDLE_FALLBACK_MS = 50;

export function afterFirstPaint(fn: () => void, host: IdleHost = window): void {
  const idle = () => {
    if (host.requestIdleCallback) host.requestIdleCallback(() => fn(), { timeout: IDLE_TIMEOUT_MS });
    else host.setTimeout(fn, IDLE_FALLBACK_MS);
  };
  if (host.requestAnimationFrame) host.requestAnimationFrame(() => host.setTimeout(idle, 0));
  else host.setTimeout(idle, 0);
}
