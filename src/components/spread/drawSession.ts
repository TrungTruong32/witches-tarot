// Một lượt bốc tại một thời điểm cho cả "Bốc bài" và "Trải bài AI" (thay cho session của DRAW_CTX bản cũ, L4813 startOrbit).
// Mỗi lúc chỉ một màn được gắn, nên lượt dở bị huỷ khi: bấm bốc lại trên cùng màn (claimDraw mới), gỡ màn (releaseDraw),
// hoặc màn tự huỷ (DrawStage.cancel — đổi kiểu trải ở "Bốc bài").

let holder: { token: number; cancel: () => void } | null = null;
let seq = 0;

/** Huỷ lượt đang giữ chỗ (gọi cancel của nó), rồi cấp mã lượt mới. */
export function claimDraw(cancel: () => void): number {
  const prev = holder;
  holder = null;
  if (prev) prev.cancel();
  const token = ++seq;
  holder = { token, cancel };
  return token;
}

/** Mã lượt còn đang giữ chỗ (chưa bị lượt mới thay, chưa nhả). */
export function isLive(token: number): boolean {
  return holder !== null && holder.token === token;
}

/** Nhả chỗ nếu mã này vẫn đang giữ (gỡ component). Không gọi cancel. */
export function releaseDraw(token: number): void {
  if (holder && holder.token === token) holder = null;
}
