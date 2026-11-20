// Gọi các nhà cung cấp AI, trả lời dạng stream.
// - BYOK (key của người dùng, lưu trong trình duyệt): Gemini, Beeknoee, ZenMux, Ollama (local hoặc Cloud).
// - "free": /api/ai của site — server tự giữ key, tự dựng system prompt và giới hạn lượt/ngày.
// Provider nào bị CORS chặn (ZenMux, Ollama Cloud) thì đi qua proxy cùng-origin /api/llm.
import type { Lang } from '../../core/types';
import { deviceId as storedDeviceId, type AiSettings } from '../storage';
import { sseData, streamLines } from './sse';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderId = 'free' | 'gemini' | 'beeknoee' | 'zenmux' | 'ollama';
export type OnToken = (t: string) => void;
export type OnReasoning = (t: string) => void;

export interface ProviderCtx {
  settings: AiSettings;
  lang: Lang;
  /** Bộ bài của trải bài (gửi cho /api/ai để server dựng prompt). */
  deck: string;
  /** Tiêm fetch (test); mặc định fetch toàn cục. */
  fetch?: typeof fetch;
  /** Huỷ lượt gọi (người dùng bắt đầu lượt mới): truyền vào mọi fetch; huỷ thì ném AbortError, không chuyển provider. */
  signal?: AbortSignal;
}

export type ProviderCall = (
  messages: ChatMessage[],
  onToken: OnToken,
  onReasoning: OnReasoning | undefined,
  ctx: ProviderCtx,
) => Promise<unknown>;

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly scope?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const fetchOf = (ctx: ProviderCtx): typeof fetch => ctx.fetch ?? globalThis.fetch.bind(globalThis);

/** Lỗi do huỷ (AbortController.abort()) — không phải lỗi của provider. */
export function isAbortError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';
}
const trimSlash = (u: string) => u.replace(/\/$/, '');

/** Gọi qua proxy cùng-origin /api/llm (tránh CORS); URL đích nằm trong header x-target-url. */
export function proxyFetch(target: string, init: RequestInit = {}, f: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), 'x-target-url': target };
  return f('/api/llm', { ...init, headers });
}

export function ollamaIsLocal(base: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(base);
}

/** Đọc thông báo lỗi trong body JSON (nhiều định dạng), mặc định "HTTP <status>". */
async function httpError(resp: Response): Promise<AiError> {
  let msg = 'HTTP ' + resp.status;
  try {
    const j = (await resp.json()) as { error?: string | { message?: string } };
    if (j.error) msg = typeof j.error === 'string' ? j.error : j.error.message || JSON.stringify(j.error);
  } catch {
    /* body không phải JSON */
  }
  return new AiError(msg, resp.status);
}

export const callGemini: ProviderCall = async (messages, onToken, _onReasoning, ctx) => {
  const s = ctx.settings;
  if (!s.geminiKey) throw new AiError('Chưa có Gemini API key. Mở “Cài đặt AI” để nhập.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(s.geminiKey)}`;
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.9 } };
  const resp = await fetchOf(ctx)(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctx.signal });
  if (!resp.ok) throw await httpError(resp);
  await streamLines(resp, line => {
    const payload = sseData(line);
    if (!payload) return;
    try {
      const j = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      for (const p of j.candidates?.[0]?.content?.parts ?? []) if (p.text) onToken(p.text);
    } catch {
      /* dòng hỏng: bỏ qua */
    }
  });
};

/** Provider tương thích OpenAI (SSE `choices[0].delta`). */
async function callOpenAICompat(
  name: string,
  base: string,
  key: string,
  model: string,
  viaProxy: boolean,
  messages: ChatMessage[],
  onToken: OnToken,
  onReasoning: OnReasoning | undefined,
  ctx: ProviderCtx,
): Promise<void> {
  if (!key) throw new AiError(`Chưa có ${name} API key. Mở “Cài đặt AI” để nhập.`);
  const body: Record<string, unknown> = { messages, stream: true, max_tokens: 8000 };
  if (model) body.model = model; // key cũ có thể gắn sẵn model
  const url = base + '/chat/completions';
  const init: RequestInit = {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctx.signal,
  };
  let resp: Response;
  try {
    resp = viaProxy ? await proxyFetch(url, init, fetchOf(ctx)) : await fetchOf(ctx)(url, init);
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new AiError(`Không kết nối được ${name} tại ${base} (có thể do CORS trình duyệt).`);
  }
  if (!resp.ok) throw await httpError(resp);
  await streamLines(resp, line => {
    const payload = sseData(line);
    if (!payload) return;
    try {
      const j = JSON.parse(payload) as { choices?: { delta?: { content?: string; reasoning_content?: string; reasoning?: string } }[] };
      const delta = j.choices?.[0]?.delta;
      if (!delta) return;
      if (delta.content) onToken(delta.content);
      const r = delta.reasoning_content || delta.reasoning;
      if (r && onReasoning) onReasoning(r);
    } catch {
      /* dòng hỏng: bỏ qua */
    }
  });
}

export const callBeeknoee: ProviderCall = (messages, onToken, onReasoning, ctx) => {
  const s = ctx.settings;
  return callOpenAICompat('Beeknoee', trimSlash(s.beeknoeeUrl || 'https://platform.beeknoee.com/api/v1'), s.beeknoeeKey, s.beeknoeeModel, false, messages, onToken, onReasoning, ctx);
};

/** ZenMux chặn CORS → đi qua /api/llm. */
export const callZenmux: ProviderCall = (messages, onToken, onReasoning, ctx) => {
  const s = ctx.settings;
  return callOpenAICompat('ZenMux', trimSlash(s.zenmuxUrl || 'https://zenmux.ai/api/v1'), s.zenmuxKey, s.zenmuxModel, true, messages, onToken, onReasoning, ctx);
};

export const callOllama: ProviderCall = async (messages, onToken, onReasoning, ctx) => {
  const s = ctx.settings;
  const base = trimSlash(s.ollamaUrl || 'http://localhost:11434');
  const local = ollamaIsLocal(base);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (s.ollamaKey) headers.Authorization = 'Bearer ' + s.ollamaKey;
  const init: RequestInit = { method: 'POST', headers, body: JSON.stringify({ model: s.ollamaModel, messages, stream: true }), signal: ctx.signal };
  let resp: Response;
  try {
    // Cloud (ollama.com) đi qua proxy để tránh CORS
    resp = local ? await fetchOf(ctx)(base + '/api/chat', init) : await proxyFetch(base + '/api/chat', init, fetchOf(ctx));
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new AiError(
      local
        ? 'Không kết nối được Ollama tại ' + base + '. Kiểm tra Ollama đang chạy và OLLAMA_ORIGINS=*.'
        : 'Không kết nối được Ollama Cloud tại ' + base + '.',
    );
  }
  if (!resp.ok) throw new AiError('Ollama HTTP ' + resp.status, resp.status);
  await streamLines(resp, line => {
    const l = line.trim();
    if (!l) return;
    try {
      const j = JSON.parse(l) as { message?: { content?: string; thinking?: string } };
      if (j.message?.content) onToken(j.message.content);
      if (j.message?.thinking && onReasoning) onReasoning(j.message.thinking);
    } catch {
      /* dòng hỏng: bỏ qua */
    }
  });
};

export interface FreeAiInfo {
  /** Model server đã dùng (header x-ai-provider). */
  model: string;
  /** Số lượt miễn phí còn lại hôm nay (header x-ai-remaining). */
  remaining: number | null;
}

let tmpDeviceId: string | null = null;

/** AI miễn phí: server tự gọi Gemini → Ollama → OpenRouter bằng key của site, giới hạn lượt/ngày cho mỗi thiết bị. */
export const callFree = async (
  messages: ChatMessage[],
  onToken: OnToken,
  _onReasoning: OnReasoning | undefined,
  ctx: ProviderCtx,
): Promise<FreeAiInfo> => {
  const en = ctx.lang === 'en';
  const dev = storedDeviceId() || (tmpDeviceId ??= crypto.randomUUID());
  const conv = messages.filter(m => m.role !== 'system'); // system prompt do server dựng
  let resp: Response;
  try {
    resp = await fetchOf(ctx)('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: dev, lang: ctx.lang, deck: ctx.deck, messages: conv }),
      signal: ctx.signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new AiError(en ? 'Cannot reach the free AI' : 'Không kết nối được AI miễn phí');
  }
  if (!resp.ok) {
    let j: { scope?: string; limit?: number; error?: string } = {};
    try {
      j = await resp.json();
    } catch {
      /* body không phải JSON */
    }
    const st = resp.status;
    if (st === 429 && j.scope === 'device')
      throw new AiError(
        en
          ? `You've used today's ${j.limit || 10} free AI readings. Come back tomorrow, or add your own (free) Gemini key in “AI Settings”.`
          : `Bạn đã dùng hết ${j.limit || 10} lượt AI miễn phí hôm nay. Quay lại vào ngày mai, hoặc nhập key Gemini riêng (miễn phí) trong “Cài đặt AI”.`,
        st,
        'device',
      );
    if (st === 429)
      throw new AiError(
        en
          ? 'The free AI is at capacity today. Please try again tomorrow, or add your own Gemini key in “AI Settings”.'
          : 'AI miễn phí đã hết lượt chung của hôm nay. Thử lại vào ngày mai, hoặc nhập key Gemini riêng trong “Cài đặt AI”.',
        st,
        j.scope,
      );
    if (st === 400 && j.error === 'bad_messages')
      throw new AiError(
        en
          ? 'This conversation is too long for the free AI (max 6 follow-up questions, 1,500 characters each). Start a new reading to continue.'
          : 'Cuộc trò chuyện đã quá dài với AI miễn phí (tối đa 6 câu hỏi tiếp, mỗi câu 1.500 ký tự). Hãy trải bài mới để hỏi tiếp.',
        st,
      );
    if (st === 502 || st === 503)
      throw new AiError(
        en
          ? 'The free AI is busy right now. Please try again in a few minutes, or add your own Gemini key in “AI Settings”.'
          : 'AI miễn phí đang bận. Thử lại sau vài phút, hoặc nhập key Gemini riêng trong “Cài đặt AI”.',
        st,
      );
    throw new AiError((en ? 'Free AI is unavailable' : 'AI miễn phí đang gặp sự cố') + ' (' + st + ')', st);
  }
  let model = '';
  try {
    model = decodeURIComponent(resp.headers.get('x-ai-provider') || '');
  } catch {
    model = '';
  }
  const rem = resp.headers.get('x-ai-remaining');
  const info: FreeAiInfo = { model, remaining: rem != null && rem !== '' ? +rem : null };
  if (resp.body) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const t = dec.decode(value, { stream: true });
      if (t) onToken(t);
    }
    const tail = dec.decode();
    if (tail) onToken(tail);
  }
  return info;
};

export const PROVIDERS: Record<ProviderId, ProviderCall> = {
  free: callFree,
  gemini: callGemini,
  beeknoee: callBeeknoee,
  zenmux: callZenmux,
  ollama: callOllama,
};
