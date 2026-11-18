// POST /api/ai — "AI miễn phí": người dùng chưa có key riêng vẫn được diễn giải ngay.
// - Key (GEMINI_API_KEY, OLLAMA_API_KEY, OPENROUTER_API_KEY) chỉ nằm ở biến môi trường server; trình duyệt không bao giờ thấy.
//   Trình duyệt KHÔNG chọn được URL/model/key: server tự dựng request, tự giới hạn độ dài trả lời.
// - Thứ tự: Gemini (Flash-Lite, free tier) → Ollama Cloud → OpenRouter (model :free, 50 lượt/ngày nếu chưa nạp $10).
//   Provider nào lỗi / hết hạn mức / trả rỗng trước khi có chữ đầu tiên thì tự chuyển sang provider kế.
//   Provider nào không có key thì bỏ qua. Đổi model bằng biến môi trường.
// - Hạn mức mỗi ngày (giờ VN): mỗi thiết bị AI_DEVICE_DAILY (10), mỗi mạng AI_IP_DAILY (30), toàn site AI_GLOBAL_DAILY (600).
//   Đếm trong bảng Supabase ai_usage (không lưu IP thô, không lưu nội dung). Lượt lỗi không bị tính.
// - Chỉ nhận request từ chính trang này. Trả về text thuần dạng stream.
// Biến môi trường: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY và ít nhất một trong GEMINI_API_KEY / OLLAMA_API_KEY / OPENROUTER_API_KEY
//   (tuỳ chọn) GEMINI_MODELS (danh sách, phẩy), OLLAMA_MODEL, OPENROUTER_MODEL, AI_DEVICE_DAILY, AI_IP_DAILY, AI_GLOBAL_DAILY, AI_HASH_SECRET
import { createHash } from 'node:crypto';
import { json, clientIp, sameOrigin, limited, acquire, readText, fetchT } from './_guard.js';

// Key trong env có thể bị dán kèm chú thích/khoảng trắng ("AIza... # ghi chú") → chỉ lấy từ đầu tiên, bỏ ngoặc kép
const envKey = n => (String(process.env[n] || '').trim().replace(/^['"]|['"]$/g, '').split(/\s+/)[0] || '').replace(/[^!-~]/g, '');
const envVal = n => String(process.env[n] || '').split(/\s+#/)[0].trim().replace(/^['"]|['"]$/g, '');
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : d);
const DEVICE_DAILY = num(process.env.AI_DEVICE_DAILY, 10);
const IP_DAILY = num(process.env.AI_IP_DAILY, 30);
const GLOBAL_DAILY = num(process.env.AI_GLOBAL_DAILY, 600);
// Gemini: hạn mức free tính RIÊNG cho từng model → xoay vòng nhiều model. GEMINI_MODELS="a,b,c" để tự chọn danh sách;
// không đặt thì server tự lấy danh sách model Flash/Flash-Lite mà key gọi được (Lite trước vì hạn mức/ngày cao hơn).
const GEMINI_MODELS_ENV = (envVal('GEMINI_MODELS') || envVal('GEMINI_MODEL')).split(',').map(x => x.trim().replace(/^models\//, '')).filter(Boolean);
const GEMINI_FALLBACK = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
const GEMINI_MAX_MODELS = 8;
const OLLAMA_MODEL = envVal('OLLAMA_MODEL') || 'gpt-oss:120b';
const OPENROUTER_MODEL = envVal('OPENROUTER_MODEL') || 'openrouter/free';   // router tự chọn model :free còn sống
const MAX_OUT = 4000;                                  // token trả lời tối đa mỗi lượt
// Hỏi tiếp gửi lại cả lịch sử (Celtic Cross + nghĩa Rider-Waite + vài lượt trả lời dài) → để rộng tay
const MAX_MSGS = 30, MAX_MSG_CHARS = 30000, MAX_TOTAL_CHARS = 90000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Ràng buộc thêm phía server để key miễn phí không bị dùng làm chatbot đa năng.
const GUARD = 'Bạn đang chạy trong ứng dụng Witches Tarot. Chỉ trả lời về tarot, ý nghĩa lá bài, trải bài và chiêm nghiệm cá nhân '
  + 'liên quan đến câu hỏi của người dùng. Nếu được yêu cầu việc khác (viết code, làm bài tập, dịch tài liệu, nội dung không liên quan…), '
  + 'hãy lịch sự từ chối và mời họ quay lại với lá bài. Đây chỉ là tham khảo & giải trí, không đưa lời khuyên y tế/pháp lý/tài chính chắc chắn.';

// Chống bị dội (DDoS / script): Vercel Firewall chặn trước (scripts/setup-firewall.mjs); ở đây thêm lớp RAM
// để từ chối thật nhanh TRƯỚC khi ghi Supabase, và giới hạn số stream AI chạy cùng lúc trên mỗi instance.
const IP_BURST = 6;            // mỗi IP tối đa 6 lượt / phút (người thật không bấm nhanh hơn)
const INSTANCE_RPS = 80;       // mỗi instance tối đa 80 request / 10 giây
const MAX_STREAMS = 40;        // mỗi instance tối đa 40 câu trả lời đang stream cùng lúc

function cleanMessages(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_MSGS) return null;
  let total = 0;
  const out = [];
  for (const m of list) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return null;
    const content = m.content.slice(0, MAX_MSG_CHARS);
    total += content.length;
    out.push({ role: m.role, content });
  }
  if (total > MAX_TOTAL_CHARS || !out.some(m => m.role === 'user')) return null;
  return out;
}

// Đọc stream SSE → các dòng "data: ..."
async function* sseData(resp) {
  const reader = resp.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) { const p = line.slice(5).trim(); if (p && p !== '[DONE]') yield p; }
    }
  }
  const last = buf.trim();
  if (last.startsWith('data:')) { const p = last.slice(5).trim(); if (p && p !== '[DONE]') yield p; }
}

async function fail(resp, name) {
  let msg = `${name} HTTP ${resp.status}`;
  try { const j = await resp.json(); const m = j?.error?.message || j?.[0]?.error?.message; if (m) msg += ': ' + String(m).slice(0, 160); } catch {}
  throw new Error(msg);
}

// --- Danh sách model Gemini (tự dò, cache 6 giờ mỗi instance) ---
let geminiCache = { at: 0, list: null };
async function geminiModels() {
  if (GEMINI_MODELS_ENV.length) return GEMINI_MODELS_ENV;
  if (geminiCache.list && Date.now() - geminiCache.at < 6 * 3600000) return geminiCache.list;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      { headers: { 'x-goog-api-key': envKey('GEMINI_API_KEY') }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('list ' + r.status);
    const names = ((await r.json()).models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(n => /^gemini-.*flash/.test(n) && !/(image|tts|audio|live|embed|native|computer|robotics|exp|-latest$)/.test(n));
    const ver = n => parseFloat((n.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const score = n => (/lite/.test(n) ? 0 : 1000) + (/preview/.test(n) ? 100 : 0) - ver(n) * 10 + (/-\d{3}$/.test(n) ? 1 : 0);
    const list = [...new Set(names)].sort((a, b) => score(a) - score(b)).slice(0, GEMINI_MAX_MODELS);
    geminiCache = { at: Date.now(), list: list.length ? list : GEMINI_FALLBACK };
  } catch {
    geminiCache = { at: Date.now() - 5.5 * 3600000, list: GEMINI_FALLBACK };   // lỗi → thử dò lại sau ~30 phút
  }
  return geminiCache.list;
}

// --- Model vừa hết hạn mức / không dùng được → tạm bỏ qua (trong RAM của instance) ---
const cooldown = new Map();   // "provider:model" → thời điểm hết chờ
function coolFor(err) {
  const m = String(err && err.message || err);
  const st = +((m.match(/HTTP (\d{3})/) || [])[1] || 0);
  if (st === 429) {
    if (/per ?day|PerDay|daily/i.test(m)) {       // hết lượt/ngày → chờ tới lúc Google reset (0h giờ Pacific ≈ 08:00 UTC)
      const d = new Date(); d.setUTCHours(8, 0, 0, 0); if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1);
      return d - Date.now();
    }
    return 65000;                                  // hết lượt/phút
  }
  if (st === 402 || st === 403) return 3600000;   // cần trả phí / không có quyền
  if (st === 404 || (st === 400 && /not (found|supported)/i.test(m))) return 6 * 3600000;   // model không tồn tại
  return 0;
}

const PROVIDERS = {
  gemini: {
    key: () => envKey('GEMINI_API_KEY'),
    models: geminiModels,
    label: m => 'Gemini (' + m + ')',
    async *stream(messages, signal, model) {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).concat(GUARD).join('\n\n');
      const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': envKey('GEMINI_API_KEY') },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.9, maxOutputTokens: MAX_OUT } })
      });
      if (!resp.ok) await fail(resp, 'Gemini[' + model + ']');
      for await (const p of sseData(resp)) {
        try {
          const parts = JSON.parse(p)?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) if (part.text && !part.thought) yield part.text;
        } catch {}
      }
    }
  },
  ollama: {
    key: () => envKey('OLLAMA_API_KEY'),
    label: () => 'Ollama (' + OLLAMA_MODEL + ')',
    models: async () => [OLLAMA_MODEL],
    async *stream(messages, signal) {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).concat(GUARD).join('\n\n');
      const msgs = [{ role: 'system', content: sys }, ...messages.filter(m => m.role !== 'system')];
      const resp = await fetch('https://ollama.com/api/chat', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + envKey('OLLAMA_API_KEY') },
        body: JSON.stringify({ model: OLLAMA_MODEL, messages: msgs, stream: true, options: { temperature: 0.9, num_predict: MAX_OUT } })
      });
      if (!resp.ok) await fail(resp, 'Ollama');
      // NDJSON: mỗi dòng {message:{content, thinking}} — bỏ phần thinking, chỉ trả nội dung
      const reader = resp.body.getReader(), dec = new TextDecoder();
      let buf = '';
      const parse = line => { try { const j = JSON.parse(line); if (j.error) throw new Error('Ollama: ' + j.error); return j.message?.content || ''; } catch (e) { if (String(e.message).startsWith('Ollama:')) throw e; return ''; } };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (line) { const t = parse(line); if (t) yield t; }
        }
      }
      if (buf.trim()) { const t = parse(buf.trim()); if (t) yield t; }
    }
  },
  openrouter: {
    key: () => envKey('OPENROUTER_API_KEY'),
    label: () => 'OpenRouter (' + OPENROUTER_MODEL + ')',
    models: async () => [OPENROUTER_MODEL],
    async *stream(messages, signal) {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).concat(GUARD).join('\n\n');
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + envKey('OPENROUTER_API_KEY') },
        body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: 'system', content: sys }, ...messages.filter(m => m.role !== 'system')],
          stream: true, temperature: 0.9, max_tokens: MAX_OUT })
      });
      if (!resp.ok) await fail(resp, 'OpenRouter');
      for await (const p of sseData(resp)) {
        try {
          const j = JSON.parse(p);
          if (j?.error) throw new Error('OpenRouter: ' + (j.error.message || 'stream error'));   // lỗi giữa stream (vd. 429)
          const t = j?.choices?.[0]?.delta?.content; if (t) yield t;
        } catch (e) { if (String(e.message).startsWith('OpenRouter:')) throw e; }
      }
    }
  }
};
const ORDER = ['gemini', 'ollama', 'openrouter'];

// Danh sách lượt thử: mọi model Gemini (đang không bị chờ) → Ollama → OpenRouter.
// Nếu mọi model đều đang chờ thì vẫn thử hết (có thể hạn mức đã được reset sớm).
async function attemptList(ready) {
  const all = [];
  for (const name of ready) for (const model of await PROVIDERS[name].models()) all.push({ name, model, id: name + ':' + model });
  const now = Date.now();
  const live = all.filter(a => !(cooldown.get(a.id) > now));
  return live.length ? live : all;
}

export async function POST(req) {
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ready = ORDER.filter(p => PROVIDERS[p].key());
  if (!sbUrl || !sbKey || !ready.length) return json(503, { error: 'not_configured' });
  if (!sameOrigin(req)) return json(403, { error: 'forbidden' });
  const ip = clientIp(req) || 'unknown';
  if (limited('ai:ip:' + ip, IP_BURST, 60000) || limited('ai:all', INSTANCE_RPS, 10000)) return json(429, { error: 'rate_limited' }, { 'retry-after': '60' });
  const raw = await readText(req, 400000);
  if (raw == null || raw.length > 200000) return json(413, { error: 'too_large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'bad_json' }); }
  const deviceId = String(body?.device_id || '');
  if (!UUID.test(deviceId)) return json(400, { error: 'bad_device' });
  const messages = cleanMessages(body?.messages);
  if (!messages) return json(400, { error: 'bad_messages' });

  // --- hạn mức theo ngày giờ Việt Nam ---
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const ipHash = createHash('sha256').update((process.env.AI_HASH_SECRET || sbKey) + '|' + day + '|' + ip).digest('hex').slice(0, 32);
  const base = sbUrl.replace(/\/+$/, '') + '/rest/v1/ai_usage';
  const auth = { apikey: sbKey, authorization: 'Bearer ' + sbKey };
  const count = async q => {
    const r = await fetchT(`${base}?select=id&day=eq.${day}${q}`, { method: 'HEAD', headers: { ...auth, prefer: 'count=exact' } });
    const n = Number((r.headers.get('content-range') || '').split('/')[1]);
    if (!r.ok || !Number.isFinite(n)) throw new Error('count ' + r.status);
    return n;
  };
  // Giữ một "chỗ" stream trên instance này; đầy thì trả 503 ngay (chưa ghi gì vào Supabase)
  const freeSlot = acquire('ai:streams', MAX_STREAMS);
  if (!freeSlot) return json(503, { error: 'busy' }, { 'retry-after': '30' });
  // Ghi 1 lượt TRƯỚC rồi mới đếm (kể cả lượt vừa ghi) → nhiều request bắn song song không lọt quá hạn mức.
  // Vượt hạn mức hoặc AI lỗi thì xoá lượt vừa ghi (không tính).
  let rowId;
  try {
    const ins = await fetchT(base, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ day, device_id: deviceId, ip_hash: ipHash }) });
    if (!ins.ok) throw new Error('insert ' + ins.status);
    rowId = (await ins.json())?.[0]?.id;
  } catch { freeSlot(); return json(503, { error: 'usage_unavailable' }); }
  const release = () => { freeSlot(); return rowId != null && fetchT(`${base}?id=eq.${rowId}`, { method: 'DELETE', headers: auth }).catch(() => {}); };
  let used;
  try {
    const [d, i, g] = await Promise.all([count(`&device_id=eq.${deviceId}&id=lte.${rowId}`), count(`&ip_hash=eq.${ipHash}&id=lte.${rowId}`), count(`&id=lte.${rowId}`)]);
    const over = g > GLOBAL_DAILY ? { error: 'quota', scope: 'global' }
      : d > DEVICE_DAILY ? { error: 'quota', scope: 'device', limit: DEVICE_DAILY }
      : i > IP_DAILY ? { error: 'quota', scope: 'ip' } : null;
    if (over) { await release(); return json(429, over); }
    used = d;                                            // đã gồm lượt này
  } catch { await release(); return json(503, { error: 'usage_unavailable' }); }

  // --- gọi lần lượt từng provider; chỉ "chốt" provider khi đã nhận được chữ đầu tiên ---
  const errors = [];
  for (const { name, model, id } of await attemptList(ready)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);   // 45s chưa có chữ nào (model có bước suy nghĩ cần lâu hơn) → bỏ qua provider này
    const it = PROVIDERS[name].stream(messages, ctrl.signal, model);
    let first;
    try {
      first = await it.next();
      clearTimeout(timer);
      if (first.done) throw new Error(name + ': empty response');
    } catch (e) {
      clearTimeout(timer); ctrl.abort();
      errors.push(String(e.message || e).slice(0, 200));
      const wait = coolFor(e);
      if (wait > 0) cooldown.set(id, Date.now() + wait);
      continue;
    }
    fetchT(`${base}?id=eq.${rowId}`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ provider: id.slice(0, 40) }) }).catch(() => {});
    const enc = new TextEncoder();
    const hardStop = setTimeout(() => ctrl.abort(), 240000);   // một câu trả lời không được giữ function quá 4 phút
    const finish = () => { clearTimeout(hardStop); freeSlot(); };
    const stream = new ReadableStream({
      async start(c) {
        c.enqueue(enc.encode(first.value));
        try { for await (const t of it) c.enqueue(enc.encode(t)); } catch {}
        finish();
        try { c.close(); } catch {}
      },
      cancel() { ctrl.abort(); finish(); }
    });
    return new Response(stream, { headers: {
      'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
      'x-ai-provider': encodeURIComponent(PROVIDERS[name].label(model)),
      'x-ai-remaining': String(Math.max(0, DEVICE_DAILY - used)),
      // provider nào bị bỏ qua và vì sao (chỉ tên + mã lỗi, không chứa key) — để chẩn đoán
      ...(errors.length ? { 'x-ai-skipped': encodeURIComponent(errors.map(e => e.replace(/^(\S+)\s+HTTP\s+(\d+).*$/s, '$1:$2').slice(0, 60)).join(' | ')) } : {})
    } });
  }
  await release();
  console.error('[api/ai] all providers failed:', errors.join(' | '));
  // Chi tiết lỗi chỉ ghi vào log server; trình duyệt chỉ nhận tên provider + mã HTTP
  return json(502, { error: 'upstream', detail: errors.map(e => e.replace(/^(\S+)\s+HTTP\s+(\d+).*$/s, '$1:$2').slice(0, 60)).join(' | ') });
}

export function GET() {
  return json(405, { error: 'method not allowed' });
}
