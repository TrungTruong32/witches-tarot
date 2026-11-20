// Một lượt bốc tại một thời điểm cho cả "Bốc bài" và "Trải bài AI" (thay cho session của DRAW_CTX bản cũ, L4813 startOrbit).
// Bắt đầu lượt mới ở bất kỳ màn nào → huỷ lượt đang dở (kể cả cùng màn: bấm bốc lại).

export type DrawOwner = 'draw' | 'reading';

let holder: { token: number; owner: DrawOwner; cancel: () => void } | null = null;
let seq = 0;

/** Huỷ lượt đang giữ chỗ (gọi cancel của nó), rồi cấp mã lượt mới cho owner. */
export function claimDraw(owner: DrawOwner, cancel: () => void): number {
  const prev = holder;
  holder = null;
  if (prev) prev.cancel();
  const token = ++seq;
  holder = { token, owner, cancel };
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
