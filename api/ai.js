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
//   (tuỳ chọn) GEMINI_MODEL, OLLAMA_MODEL, OPENROUTER_MODEL, AI_DEVICE_DAILY, AI_IP_DAILY, AI_GLOBAL_DAILY, AI_HASH_SECRET
import { createHash } from 'node:crypto';

const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : d);
const DEVICE_DAILY = num(process.env.AI_DEVICE_DAILY, 10);
const IP_DAILY = num(process.env.AI_IP_DAILY, 30);
const GLOBAL_DAILY = num(process.env.AI_GLOBAL_DAILY, 600);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:120b';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';   // router tự chọn model :free còn sống
const MAX_OUT = 4000;                                  // token trả lời tối đa mỗi lượt
// Hỏi tiếp gửi lại cả lịch sử (Celtic Cross + nghĩa Rider-Waite + vài lượt trả lời dài) → để rộng tay
const MAX_MSGS = 30, MAX_MSG_CHARS = 30000, MAX_TOTAL_CHARS = 90000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Ràng buộc thêm phía server để key miễn phí không bị dùng làm chatbot đa năng.
const GUARD = 'Bạn đang chạy trong ứng dụng Witches Tarot. Chỉ trả lời về tarot, ý nghĩa lá bài, trải bài và chiêm nghiệm cá nhân '
  + 'liên quan đến câu hỏi của người dùng. Nếu được yêu cầu việc khác (viết code, làm bài tập, dịch tài liệu, nội dung không liên quan…), '
  + 'hãy lịch sự từ chối và mời họ quay lại với lá bài. Đây chỉ là tham khảo & giải trí, không đưa lời khuyên y tế/pháp lý/tài chính chắc chắn.';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const o = new URL(origin), host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return o.host === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch { return false; }
}

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

const PROVIDERS = {
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    label: () => 'Gemini (' + GEMINI_MODEL + ')',
    async *stream(messages, signal) {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).concat(GUARD).join('\n\n');
      const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:streamGenerateContent?alt=sse`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.9, maxOutputTokens: MAX_OUT } })
      });
      if (!resp.ok) await fail(resp, 'Gemini');
      for await (const p of sseData(resp)) {
        try {
          const parts = JSON.parse(p)?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) if (part.text && !part.thought) yield part.text;
        } catch {}
      }
    }
  },
  ollama: {
    key: () => process.env.OLLAMA_API_KEY,
    label: () => 'Ollama (' + OLLAMA_MODEL + ')',
    async *stream(messages, signal) {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).concat(GUARD).join('\n\n');
      const msgs = [{ role: 'system', content: sys }, ...messages.filter(m => m.role !== 'system')];
      const resp = await fetch('https://ollama.com/api/chat', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OLLAMA_API_KEY },
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
    key: () => process.env.OPENROUTER_API_KEY,
    label: () => 'OpenRouter (' + OPENROUTER_MODEL + ')',
    async *stream(messages, signal) {
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).concat(GUARD).join('\n\n');
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
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

export async function POST(req) {
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ready = ORDER.filter(p => PROVIDERS[p].key());
  if (!sbUrl || !sbKey || !ready.length) return json(503, { error: 'not_configured' });
  if (!sameOrigin(req)) return json(403, { error: 'forbidden' });
  const raw = await req.text();
  if (raw.length > 200000) return json(413, { error: 'too_large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'bad_json' }); }
  const deviceId = String(body?.device_id || '');
  if (!UUID.test(deviceId)) return json(400, { error: 'bad_device' });
  const messages = cleanMessages(body?.messages);
  if (!messages) return json(400, { error: 'bad_messages' });

  // --- hạn mức theo ngày giờ Việt Nam ---
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipHash = createHash('sha256').update((process.env.AI_HASH_SECRET || sbKey) + '|' + day + '|' + ip).digest('hex').slice(0, 32);
  const base = sbUrl.replace(/\/+$/, '') + '/rest/v1/ai_usage';
  const auth = { apikey: sbKey, authorization: 'Bearer ' + sbKey };
  const count = async q => {
    const r = await fetch(`${base}?select=id&day=eq.${day}${q}`, { method: 'HEAD', headers: { ...auth, prefer: 'count=exact' } });
    if (!r.ok) throw new Error('count ' + r.status);
    return Number((r.headers.get('content-range') || '').split('/')[1] || 0);
  };
  // Ghi 1 lượt TRƯỚC rồi mới đếm (kể cả lượt vừa ghi) → nhiều request bắn song song không lọt quá hạn mức.
  // Vượt hạn mức hoặc AI lỗi thì xoá lượt vừa ghi (không tính).
  const ins = await fetch(base, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ day, device_id: deviceId, ip_hash: ipHash }) });
  if (!ins.ok) return json(503, { error: 'usage_unavailable' });
  const rowId = (await ins.json())?.[0]?.id;
  const release = () => rowId != null && fetch(`${base}?id=eq.${rowId}`, { method: 'DELETE', headers: auth }).catch(() => {});
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
  for (const name of ready) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);   // 45s chưa có chữ nào (model có bước suy nghĩ cần lâu hơn) → bỏ qua provider này
    const it = PROVIDERS[name].stream(messages, ctrl.signal);
    let first;
    try {
      first = await it.next();
      clearTimeout(timer);
      if (first.done) throw new Error(name + ': empty response');
    } catch (e) {
      clearTimeout(timer); ctrl.abort();
      errors.push(String(e.message || e).slice(0, 200));
      continue;
    }
    fetch(`${base}?id=eq.${rowId}`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ provider: name }) }).catch(() => {});
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(c) {
        c.enqueue(enc.encode(first.value));
        try { for await (const t of it) c.enqueue(enc.encode(t)); } catch {}
        c.close();
      },
      cancel() { ctrl.abort(); }
    });
    return new Response(stream, { headers: {
      'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
      'x-ai-provider': encodeURIComponent(PROVIDERS[name].label()),
      'x-ai-remaining': String(Math.max(0, DEVICE_DAILY - used))
    } });
  }
  await release();
  console.error('[api/ai] all providers failed:', errors.join(' | '));
  return json(502, { error: 'upstream', detail: errors.join(' | ') });
}

export function GET() {
  return json(405, { error: 'method not allowed' });
}
