// Toạ độ GPS lần gần nhất trong phiên: rời màn "Bầu trời" rồi quay lại (vẫn chọn 'gps') thì giữ vị trí như bản cũ
// (trang không tải lại). Chỉ trong bộ nhớ — không ghi xuống storage.

export interface GpsFix { lat: number; lon: number }

let last: GpsFix | null = null;

export function lastGps(): GpsFix | null {
  return last;
}

export function rememberGps(fix: GpsFix): void {
  last = fix;
}

/** Chỉ cho test: quên toạ độ đã nhớ. */
export function resetForTests(): void {
  last = null;
}
