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

const MIN_TS = Date.UTC(2020, 0, 1);
const BATCH_MAX = 25, BACKFILL_MAX_PER_DEVICE = 1000;

// Làm sạch MỘT trải bài. backfill=true: dùng thời điểm gốc từ trình duyệt (client_ts) làm created_at.
function clean(body, deviceId, backfill) {
  if (!body || typeof body !== 'object') return null;
  if (!UUID.test(String(deviceId || ''))) return null;
  if (!Array.isArray(body.cards) || body.cards.length < 1 || body.cards.length > 15) return null;
  const cards = body.cards.map(c => ({
    id: Number.isFinite(+c?.id) ? +c.id : null,
    name: str(c?.name, 80),
    suit: str(c?.suit, 40),
    number: str(c?.number, 10),
    orientation: c?.orientation === 'nguoc' || c?.orientation === 'reversed' ? 'reversed' : 'upright',
    position: str(c?.position, 80)
  }));
  if (cards.some(c => !c.name)) return null;
  const ts = Number.isSafeInteger(body.client_ts) && body.client_ts >= MIN_TS && body.client_ts <= Date.now() + 5 * 60000 ? body.client_ts : null;
  if (backfill && ts == null) return null;           // đồng bộ lịch sử bắt buộc có thời điểm gốc hợp lệ
  const row = {
    device_id: deviceId,
    client_ts: ts,
    source: backfill ? 'backfill' : 'live',
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
  if (backfill) row.created_at = new Date(ts).toISOString();
  return row;
}

export async function POST(req) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { ok: false, error: 'storage not configured' });
  if (!sameOrigin(req)) return json(403, { ok: false, error: 'forbidden' });
  if (ipLimited(req)) return json(429, { ok: false, error: 'rate limited' });
  const raw = await req.text();
  if (raw.length > 900000) return json(413, { ok: false, error: 'too large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'bad json' }); }

  // Hai kiểu gửi: một trải bài (live) hoặc { device_id, batch: [...] } (đồng bộ lịch sử cũ, tối đa 25/lần)
  const isBatch = body && Array.isArray(body.batch);
  if (!isBatch && raw.length > 60000) return json(413, { ok: false, error: 'too large' });
  if (isBatch && (body.batch.length < 1 || body.batch.length > BATCH_MAX)) return json(400, { ok: false, error: 'invalid batch' });
  const rows = isBatch ? body.batch.map(r => clean(r, body.device_id, true)).filter(Boolean) : [clean(body, body?.device_id, false)].filter(Boolean);
  if (!rows.length) return json(400, { ok: false, error: 'invalid reading' });
  const deviceId = rows[0].device_id;

  const base = url.replace(/\/+$/, '') + '/rest/v1/readings';
  const auth = { apikey: key, authorization: 'Bearer ' + key };
  const count = async q => Number(((await fetch(`${base}?select=id&${q}`, { method: 'HEAD', headers: { ...auth, prefer: 'count=exact' } })).headers.get('content-range') || '').split('/')[1] || 0);

  if (isBatch) {
    // Mỗi thiết bị đồng bộ tối đa BACKFILL_MAX_PER_DEVICE trải bài cũ
    if (await count(`device_id=eq.${deviceId}&source=eq.backfill`) + rows.length > BACKFILL_MAX_PER_DEVICE) return json(429, { ok: false, error: 'backfill limit' });
  } else {
    // Giới hạn tần suất theo device_id (đếm trong DB, không cần lưu IP)
    const since = new Date(Date.now() - RATE_MIN * 60000).toISOString();
    if (await count(`device_id=eq.${deviceId}&source=eq.live&created_at=gte.${encodeURIComponent(since)}`) >= RATE_MAX) return json(429, { ok: false, error: 'rate limited' });
    const hour = new Date(Date.now() - 3600000).toISOString();
    if (await count(`source=eq.live&created_at=gte.${encodeURIComponent(hour)}`) >= GLOBAL_MAX_PER_HOUR) return json(429, { ok: false, error: 'busy' });
  }

  // Trùng (cùng device_id + client_ts) thì bỏ qua → gửi lại bao nhiêu lần cũng không nhân đôi
  const ins = await fetch(base + '?on_conflict=device_id,client_ts', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json', prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(isBatch ? rows : rows[0])
  });
  if (!ins.ok) return json(502, { ok: false, error: 'storage error', status: ins.status });
  return json(201, { ok: true, received: rows.length, skipped: isBatch ? body.batch.length - rows.length : 0 });
}

export function GET() {
  return json(405, { ok: false, error: 'method not allowed' });
}
