// Ngữ cảnh một lượt gọi AI (ProviderCtx) từ cài đặt hiện tại — dùng chung cho Trải bài AI và Yes/No.
import type { ProviderCtx } from '../services/ai/providers';
import { useApp } from './store';

/** `deck` = bộ của lượt hỏi (rỗng → bộ đang chọn). `signal` huỷ lượt gọi khi người dùng bắt đầu lượt mới / rời màn. */
export function aiCtx(deck: string, signal?: AbortSignal): ProviderCtx {
  const app = useApp.getState();
  return { settings: app.aiSettings, lang: app.lang, deck: deck || app.deck || '', signal };
}
