// Phụ thuộc có thể thay trong test (lá bài cố định, AI giả) cho màn Yes/No.
import { chatComplete } from '../../services/ai/chat';

export const yesNoDeps: { rng: () => number; chat: typeof chatComplete } = {
  rng: Math.random,
  chat: chatComplete,
};

export function resetYesNoDeps(): void {
  yesNoDeps.rng = Math.random;
  yesNoDeps.chat = chatComplete;
}
