// Trạng thái màn "Bốc bài" (Zustand riêng). Không lưu xuống storage — rời màn rồi quay lại vẫn còn kiểu trải và kết quả.
import { create } from 'zustand';
import type { SpreadCard } from '../../core/types';

export interface DrawState {
  /** Kiểu trải đang chọn ở màn Bốc bài (độc lập với Trải bài AI cho tới khi bấm "Đưa sang Trải bài AI"). */
  spreadKey: string;
  /** Các lá vừa bốc (mỗi lá có uid). */
  result: SpreadCard[];
  /** Ô "Số lá" của kiểu Tự do (chuỗi như ô nhập) — giữ khi rời màn rồi quay lại. */
  count: string;
  setSpreadKey(k: string): void;
  setResult(c: SpreadCard[]): void;
  setCount(v: string): void;
}

type Data = Pick<DrawState, 'spreadKey' | 'result' | 'count'>;

/** Trạng thái ban đầu (dùng để reset trong test). */
export function initialDraw(): Data {
  return { spreadKey: 'free', result: [], count: '3' };
}

export const useDraw = create<DrawState>()(set => ({
  ...initialDraw(),
  setSpreadKey: k => set({ spreadKey: k }),
  setResult: c => set({ result: c }),
  setCount: v => set({ count: v }),
}));
