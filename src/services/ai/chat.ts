// Chọn provider và tự chuyển sang provider kế khi lỗi.
import { DEFAULT_AI_SETTINGS, type AiSettings, type BYOKProvider } from '../storage';
import { isAbortError, PROVIDERS, type ChatMessage, type FreeAiInfo, type OnReasoning, type OnToken, type ProviderCall, type ProviderCtx, type ProviderId } from './providers';

export const PROVIDER_ORDER: readonly BYOKProvider[] = ['gemini', 'zenmux', 'beeknoee', 'ollama'];

/**
 * Provider p đã đủ thông tin để gọi chưa? Ollama mặc định luôn có model (llama3.1) nên chỉ coi là
 * "sẵn sàng làm dự phòng" khi đó là provider chính, có key (Cloud) hoặc đã đổi URL khác mặc định.
 */
export function providerReady(p: ProviderId, s: AiSettings): boolean {
  if (p === 'free') return s.freeAi !== false; // AI miễn phí qua /api/ai (key nằm ở server)
  if (p === 'gemini') return !!s.geminiKey;
  if (p === 'beeknoee') return !!s.beeknoeeKey;
  if (p === 'zenmux') return !!s.zenmuxKey;
  if (!s.ollamaModel) return false;
  return p === s.provider || !!s.ollamaKey || (s.ollamaUrl || '').replace(/\/$/, '') !== DEFAULT_AI_SETTINGS.ollamaUrl;
}

/**
 * Thứ tự thử: provider chính trước, rồi (nếu bật tự chuyển) các provider khác đã cấu hình.
 * Chưa nhập key nào → dùng AI miễn phí; có key riêng → key riêng trước, AI miễn phí làm dự phòng cuối.
 */
export function providerChain(s: AiSettings): ProviderId[] {
  const main = s.provider;
  const free: ProviderId[] = providerReady('free', s) ? ['free'] : [];
  if (s.autoFallback === false) return providerReady(main, s) ? [main] : free.length ? free : [main];
  const own = [main, ...PROVIDER_ORDER.filter(p => p !== main)].filter(p => providerReady(p, s));
  const chain: ProviderId[] = [...own, ...free];
  return chain.length ? chain : [main];
}

function isFreeInfo(r: unknown): r is FreeAiInfo {
  return !!r && typeof r === 'object' && typeof (r as FreeAiInfo).model === 'string';
}

export interface ChatCallbacks {
  onToken: OnToken;
  onReasoning?: OnReasoning;
  /** Báo cho UI biết đang chuyển provider (from lỗi → thử to). */
  onSwitch?: (from: ProviderId, to: ProviderId, err: unknown) => void;
}

/** Kết quả một lượt chat: provider đã trả lời (+ thông tin model/lượt còn lại nếu là AI miễn phí). */
export interface ChatResult {
  provider: ProviderId;
  free?: FreeAiInfo;
}

/**
 * Gửi một lượt chat. Nếu provider lỗi (hoặc trả về rỗng) TRƯỚC khi có chữ nào được stream, tự chuyển sang provider kế.
 * Đã stream được một phần thì KHÔNG chuyển (tránh ghép 2 câu trả lời) mà báo lỗi luôn. Trả về provider đã trả lời (kèm FreeAiInfo khi là AI miễn phí).
 */
export async function chatComplete(
  messages: ChatMessage[],
  cb: ChatCallbacks,
  ctx: ProviderCtx,
  calls: Record<ProviderId, ProviderCall> = PROVIDERS,
): Promise<ChatResult> {
  const chain = providerChain(ctx.settings);
  let lastErr: unknown = new Error('no provider');
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i] as ProviderId;
    const next = chain[i + 1];
    let got = false;
    try {
      const r = await calls[p](messages, t => { got = true; cb.onToken(t); }, cb.onReasoning, ctx);
      if (!got && next) throw new Error(ctx.lang === 'en' ? 'empty response' : 'không trả về nội dung');
      return p === 'free' && isFreeInfo(r) ? { provider: p, free: r } : { provider: p };
    } catch (e) {
      // Đã stream một phần, hết provider, hoặc người dùng huỷ → không chuyển provider
      if (got || !next || isAbortError(e) || ctx.signal?.aborted) throw e;
      lastErr = e;
      cb.onSwitch?.(p, next, e);
    }
  }
  throw lastErr;
}
