// Công cụ cho hộp "Cài đặt AI": tải danh sách model (đồng thời kiểm tra key) và gọi thử model đã chọn.
// Theo bản cũ L3047–3363. Mọi hàm nhận cài đặt ĐANG NHẬP trên form (chưa cần bấm Lưu).
import type { Lang } from '../../core/types';
import type { AiSettings, BYOKProvider } from '../storage';
import { AiError, ollamaIsLocal, proxyFetch, type FreeAiInfo, type ProviderId } from './providers';

/** Model nên dùng, xếp lên đầu danh sách gợi ý (giữ cả khi API không trả về). */
export const RECOMMENDED: { beeknoee: string[]; zenmux: string[] } = {
  beeknoee: ['GLM-4.5-Flash', 'GLM-4.7-Flash', 'Laguna M.1', 'GPT-OSS 120B'],
  zenmux: ['x-ai/grok-4.5-free', 'z-ai/glm-4.7-flash-free'],
};

/** Model Gemini gợi ý đầu danh sách. */
export const GEMINI_PREFERRED = ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest', 'gemini-3.1-pro', 'gemini-3.1-flash',
  'gemini-3.1-flash-lite', 'gemini-3-pro', 'gemini-3-flash'];

const normModel = (s: string) => String(s).toLowerCase().replace(/[\s._/-]/g, '');

/** Model gợi ý lên đầu (so khớp bỏ dấu cách/chấm/gạch), rồi tới phần còn lại theo thứ tự đã có. */
export function orderModels(models: string[], preferred: string[] = []): string[] {
  const head: string[] = [];
  const seen = new Set<string>();
  for (const p of preferred) {
    const k = normModel(p);
    if (seen.has(k)) continue;
    seen.add(k);
    head.push(models.find(m => normModel(m) === k) ?? p);
  }
  return head.concat(models.filter(m => !seen.has(normModel(m))));
}

// Form đang nhập chưa qua bước Lưu (chưa trim) → trim ở đây, ô trống thì dùng URL mặc định như bản cũ.
const urlOr = (v: string, def: string) => (v.trim() || def).replace(/\/$/, '');
const baseOf = (p: BYOKProvider, s: AiSettings) =>
  p === 'beeknoee' ? urlOr(s.beeknoeeUrl, 'https://platform.beeknoee.com/api/v1')
    : p === 'zenmux' ? urlOr(s.zenmuxUrl, 'https://zenmux.ai/api/v1')
      : urlOr(s.ollamaUrl, 'http://localhost:11434');

async function failure(resp: Response): Promise<AiError> {
  let msg = 'HTTP ' + resp.status;
  try {
    const j = (await resp.json()) as { error?: string | { message?: string } };
    if (j.error) msg = typeof j.error === 'string' ? j.error : j.error.message || JSON.stringify(j.error);
  } catch {
    /* không phải JSON */
  }
  return new AiError(msg, resp.status);
}

/** Danh sách model gọi được với key/URL này. Ném AiError (thông báo như bản cũ) nếu thiếu key hoặc API lỗi. */
export async function listModels(p: BYOKProvider, s: AiSettings, f: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<string[]> {
  if (p === 'gemini') {
    const key = s.geminiKey.trim();
    if (!key) throw new AiError('Nhập API key trước đã.');
    const models: string[] = [];
    let pageToken = '';
    do {
      const u = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=100'
        + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const resp = await f(u);
      if (!resp.ok) throw await failure(resp);
      const j = (await resp.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
      for (const m of j.models ?? []) if ((m.supportedGenerationMethods ?? []).includes('generateContent')) models.push((m.name || '').replace(/^models\//, ''));
      pageToken = j.nextPageToken || '';
    } while (pageToken);
    return models.sort();
  }
  if (p === 'ollama') {
    const base = baseOf(p, s);
    const headers: Record<string, string> = {};
    if (s.ollamaKey.trim()) headers.Authorization = 'Bearer ' + s.ollamaKey.trim();
    const resp = ollamaIsLocal(base) ? await f(base + '/api/tags', { headers }) : await proxyFetch(base + '/api/tags', { headers }, f);
    if (!resp.ok) throw new AiError('HTTP ' + resp.status, resp.status);
    const j = (await resp.json()) as { models?: { name?: string }[] };
    return (j.models ?? []).map(m => m.name ?? '').filter(Boolean).sort();
  }
  // Beeknoee / ZenMux: chuẩn OpenAI (GET {base}/models). ZenMux chặn CORS → qua proxy.
  const key = (p === 'beeknoee' ? s.beeknoeeKey : s.zenmuxKey).trim();
  if (!key) throw new AiError('Nhập API key trước.');
  const url = baseOf(p, s) + '/models';
  const init = { headers: { Authorization: 'Bearer ' + key } };
  const resp = p === 'zenmux' ? await proxyFetch(url, init, f) : await f(url, init);
  if (!resp.ok) throw await failure(resp);
  const j = (await resp.json()) as { data?: unknown[]; models?: unknown[] };
  const list = j.data || j.models || [];
  const ids = list.map(m => {
    if (typeof m === 'string') return m;
    const o = m as { providerModelId?: string; id?: string; model?: string };
    return (p === 'beeknoee' ? o.providerModelId || o.id : o.id) || o.model || '';
  });
  return [...new Set(ids.filter(Boolean))].sort();
}

/** Gọi thật model đang chọn với một câu ngắn để chắc chắn model dùng được. */
export async function testModel(p: BYOKProvider, s: AiSettings, f: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<void> {
  const ping = 'Trả lời ngắn: ok';
  if (p === 'gemini') {
    const key = s.geminiKey.trim();
    const model = s.geminiModel.trim();
    if (!key) throw new AiError('Nhập API key trước.');
    if (!model) throw new AiError('Chọn một model trước (bấm “Tải danh sách”).');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const resp = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: ping }] }] }) });
    if (!resp.ok) throw await failure(resp);
    return;
  }
  if (p === 'ollama') {
    const base = baseOf(p, s);
    const model = s.ollamaModel.trim();
    const key = s.ollamaKey.trim();
    const local = ollamaIsLocal(base);
    if (!model) throw new AiError('Chọn/gõ model trước.');
    if (!local && !key) throw new AiError('Ollama Cloud cần API key.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    const init = { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: ping }], stream: false }) };
    const resp = local ? await f(base + '/api/chat', init) : await proxyFetch(base + '/api/chat', init, f);
    if (!resp.ok) throw await failure(resp);
    return;
  }
  const key = (p === 'beeknoee' ? s.beeknoeeKey : s.zenmuxKey).trim();
  const model = (p === 'beeknoee' ? s.beeknoeeModel : s.zenmuxModel).trim();
  if (!key) throw new AiError('Nhập API key trước.');
  if (!model) throw new AiError('Chọn/tải model trước.');
  const url = baseOf(p, s) + '/chat/completions';
  const init = {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: ping }], stream: true, max_tokens: 16 }),
  };
  const resp = p === 'zenmux' ? await proxyFetch(url, init, f) : await f(url, init);
  if (!resp.ok) throw await failure(resp);
  try {
    await resp.body?.cancel();
  } catch {
    /* đã đủ: gọi được là xong */
  }
}

/** Tên provider kèm model, như providerLabel của bản cũ. */
export function providerLabel(p: ProviderId, s: AiSettings, lang: Lang, free: FreeAiInfo = { model: '', remaining: null }): string {
  const en = lang === 'en';
  const def = en ? 'default' : 'mặc định';
  if (p === 'free') {
    let out = en ? 'Free AI' : 'AI miễn phí';
    if (free.model) out += ' · ' + free.model;
    if (free.remaining != null) out += en ? ` · ${free.remaining} left today` : ` · còn ${free.remaining} lượt hôm nay`;
    return out;
  }
  if (p === 'gemini') return 'Gemini (' + s.geminiModel + ')';
  if (p === 'beeknoee') return 'Beeknoee (' + (s.beeknoeeModel || def) + ')';
  if (p === 'zenmux') return 'ZenMux (' + (s.zenmuxModel || def) + ')';
  return 'Ollama (' + s.ollamaModel + ')';
}
