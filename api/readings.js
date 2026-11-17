// POST /api/readings — lưu một trải bài ẩn danh vào Supabase.
// - Không lưu IP / email / tên. device_id là UUID ngẫu nhiên do trình duyệt tự sinh.
// - Khoá Supabase (service role) chỉ nằm ở biến môi trường server, trình duyệt không bao giờ thấy.
// - Chống spam: chỉ nhận từ chính trang này, giới hạn kích thước, tối đa RATE_MAX lần / RATE_MIN phút cho mỗi device_id.
// Biến môi trường cần có trên Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const RATE_MAX = 20, RATE_MIN = 10;          // mỗi device_id: tối đa 20 lần / 10 phút
const IP_MAX = 30, IP_WINDOW = 10 * 60000;    // mỗi IP: 30 lần / 10 phút — chỉ đếm trong RAM của instance, KHÔNG lưu IP xuống DB
const GLOBAL_MAX_PER_HOUR = 3000;             // trần toàn hệ thống để không ai làm ngập DB
const ipHits = new Map();
function ipLimited(req) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  if (!ip) return false;
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter(t => now - t < IP_WINDOW);
  arr.push(now); ipHits.set(ip, arr);
  if (ipHits.size > 5000) for (const [k, v] of ipHits) if (!v.length || now - v[v.length - 1] > IP_WINDOW) ipHits.delete(k);
  return arr.length > IP_MAX;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const o = new URL(origin), host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return o.host === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch { return false; }
}

function clean(body) {
  if (!body || typeof body !== 'object') return null;
  if (!UUID.test(String(body.device_id || ''))) return null;
  if (!Array.isArray(body.cards) || body.cards.length < 1 || body.cards.length > 15) return null;
  const cards = body.cards.map(c => ({
    id: Number.isFinite(+c?.id) ? +c.id : null,
    name: str(c?.name, 80),
    suit: str(c?.suit, 40),
    number: str(c?.number, 10),
    orientation: c?.orientation === 'nguoc' ? 'reversed' : 'upright',
    position: str(c?.position, 80)
  }));
  if (cards.some(c => !c.name)) return null;
  return {
    device_id: body.device_id,
    lang: body.lang === 'en' ? 'en' : 'vi',
    deck: str(body.deck, 200),
    spread: str(body.spread, 40),
    question: str(body.question, 1000),
    cards,
    facts: Array.isArray(body.facts) ? body.facts.slice(0, 20).map(f => String(f).slice(0, 400)) : null,
    ai_answer: str(body.ai_answer, 30000),
    model: str(body.model, 120),
    app_version: str(body.app_version, 40)
  };
}

export async function POST(req) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { ok: false, error: 'storage not configured' });
  if (!sameOrigin(req)) return json(403, { ok: false, error: 'forbidden' });
  if (ipLimited(req)) return json(429, { ok: false, error: 'rate limited' });
  const raw = await req.text();
  if (raw.length > 60000) return json(413, { ok: false, error: 'too large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'bad json' }); }
  const row = clean(body);
  if (!row) return json(400, { ok: false, error: 'invalid reading' });

  const base = url.replace(/\/+$/, '') + '/rest/v1/readings';
  const auth = { apikey: key, authorization: 'Bearer ' + key };

  // Giới hạn tần suất theo device_id (đếm trong DB, không cần lưu IP)
  const since = new Date(Date.now() - RATE_MIN * 60000).toISOString();
  const cnt = await fetch(`${base}?select=id&device_id=eq.${row.device_id}&created_at=gte.${encodeURIComponent(since)}`, {
    method: 'HEAD', headers: { ...auth, prefer: 'count=exact' }
  });
  const total = Number((cnt.headers.get('content-range') || '').split('/')[1] || 0);
  if (total >= RATE_MAX) return json(429, { ok: false, error: 'rate limited' });
  const hour = new Date(Date.now() - 3600000).toISOString();
  const all = await fetch(`${base}?select=id&created_at=gte.${encodeURIComponent(hour)}`, { method: 'HEAD', headers: { ...auth, prefer: 'count=estimated' } });
  if (Number((all.headers.get('content-range') || '').split('/')[1] || 0) >= GLOBAL_MAX_PER_HOUR) return json(429, { ok: false, error: 'busy' });

  const ins = await fetch(base, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (!ins.ok) return json(502, { ok: false, error: 'storage error', status: ins.status });
  return json(201, { ok: true });
}

export function GET() {
  return json(405, { ok: false, error: 'method not allowed' });
}
