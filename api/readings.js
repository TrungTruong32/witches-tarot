// POST /api/readings — lưu một trải bài ẩn danh vào Supabase.
// - Không lưu IP / email / tên. device_id là UUID ngẫu nhiên do trình duyệt tự sinh.
// - Khoá Supabase (service role) chỉ nằm ở biến môi trường server, trình duyệt không bao giờ thấy.
// - Chống spam / làm đầy database (device_id do client tự đặt nên KHÔNG dùng làm hàng rào duy nhất):
//   1) Vercel Firewall rate limit theo IP (scripts/setup-firewall.mjs) — chặn trước khi tới function
//   2) giới hạn trong RAM theo IP + theo instance — từ chối trước khi gọi Supabase
//   3) trần toàn hệ thống: số trải bài mới mỗi ngày, DUNG LƯỢNG database (MB), tổng số bản ghi "lịch sử cũ"
//   4) nhánh đồng bộ lịch sử cũ (batch) tự đóng sau BACKFILL_UNTIL
//   Dung lượng đo bằng hàm db_size_bytes() (migration 20261118120000_storage_guard.sql). Chưa có hàm đó thì
//   dùng tạm trần số bản ghi READINGS_MAX_ROWS (một bản ghi xấu nhất ~65KB → 6000 bản ghi ≈ 400MB).
// Biến môi trường: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   (tuỳ chọn) READINGS_DAILY_MAX, READINGS_MAX_MB, READINGS_MAX_ROWS, BACKFILL_UNTIL (YYYY-MM-DD), BACKFILL_TOTAL_MAX
import { json, clientIp, sameOrigin, limited, readText, fetchT, cached } from './_guard.js';

const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : d);
const RATE_MAX = 20, RATE_MIN = 10;                                  // mỗi device_id: 20 lần / 10 phút
const DAILY_MAX = num(process.env.READINGS_DAILY_MAX, 1500);          // trải bài mới (live) toàn site mỗi 24 giờ
const MAX_BYTES = num(process.env.READINGS_MAX_MB, 350) * 1048576;    // ngừng nhận khi database ≥ 350MB (gói free 500MB)
const MAX_ROWS = num(process.env.READINGS_MAX_ROWS, 6000);            // dự phòng khi chưa có hàm db_size_bytes()
const BACKFILL_TOTAL_MAX = num(process.env.BACKFILL_TOTAL_MAX, 5000); // tổng số trải bài cũ được đồng bộ
const BACKFILL_UNTIL = Date.parse((process.env.BACKFILL_UNTIL || '2026-11-30') + 'T23:59:59+07:00');
const BATCH_MAX = 25, BACKFILL_MAX_PER_DEVICE = 1000;
const MIN_TS = Date.UTC(2020, 0, 1);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const DECKS = new Set(['Witches Tarot', 'Rider-Waite']);   // chỉ 2 bộ có sẵn (đã bỏ tính năng import bộ bài)
const deckOk = d => typeof d === 'string' && d.split(/\s*,\s*/).every(x => DECKS.has(x));

// Làm sạch MỘT trải bài. backfill=true: dùng thời điểm gốc từ trình duyệt (client_ts) làm created_at.
function clean(body, deviceId, backfill) {
  if (!body || typeof body !== 'object') return null;
  if (!UUID.test(String(deviceId || ''))) return null;
  if (!Array.isArray(body.cards) || body.cards.length < 1 || body.cards.length > 15) return null;
  if (!deckOk(body.deck)) return null;
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
    ai_answer: str(body.ai_answer, 20000),             // câu trả lời tối đa ~4000 token ≈ 16k ký tự
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
  const ip = clientIp(req) || 'unknown';
  // Lớp RAM: một IP tối đa 30 lần / 10 phút; một instance tối đa 150 lần / 10 giây (quá thì trả lỗi ngay, không đụng DB)
  if (limited('rd:ip:' + ip, 30, 10 * 60000) || limited('rd:all', 150, 10000)) return json(429, { ok: false, error: 'rate limited' }, { 'retry-after': '60' });
  const raw = await readText(req, 2_000_000);
  if (raw == null || raw.length > 900000) return json(413, { ok: false, error: 'too large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'bad json' }); }

  // Hai kiểu gửi: một trải bài (live) hoặc { device_id, batch: [...] } (đồng bộ lịch sử cũ, tối đa 25/lần)
  const isBatch = body && Array.isArray(body.batch);
  if (!isBatch && raw.length > 60000) return json(413, { ok: false, error: 'too large' });
  if (isBatch) {
    if (Date.now() > BACKFILL_UNTIL) return json(410, { ok: false, error: 'backfill closed' });
    if (body.batch.length < 1 || body.batch.length > BATCH_MAX) return json(400, { ok: false, error: 'invalid batch' });
    if (limited('rd:bf:' + ip, 40, 3600000)) return json(429, { ok: false, error: 'rate limited' }, { 'retry-after': '3600' });   // ≤ 1000 trải bài cũ / giờ / IP
  }
  const rows = isBatch ? body.batch.map(r => clean(r, body.device_id, true)).filter(Boolean) : [clean(body, body?.device_id, false)].filter(Boolean);
  if (!rows.length) return json(400, { ok: false, error: 'invalid reading' });
  const deviceId = rows[0].device_id;

  const base = url.replace(/\/+$/, '') + '/rest/v1/readings';
  const auth = { apikey: key, authorization: 'Bearer ' + key };
  // Đếm bản ghi. Lỗi / quá giờ → ném lỗi (KHÔNG coi là 0, tránh lọt giới hạn khi DB chập chờn)
  const count = async (q, mode = 'exact') => {
    const r = await fetchT(`${base}?select=id&${q}`, { method: 'HEAD', headers: { ...auth, prefer: 'count=' + mode } });
    const n = Number((r.headers.get('content-range') || '').split('/')[1]);
    if (!r.ok || !Number.isFinite(n)) throw new Error('count ' + r.status);
    return n;
  };

  try {
    // Chặn làm đầy database: đo dung lượng thật (nhớ 60 giây); chưa có hàm đo thì đếm số bản ghi
    const full = await cached('rd:full', 60000, async () => {
      const r = await fetchT(url.replace(/\/+$/, '') + '/rest/v1/rpc/db_size_bytes', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' });
      if (r.ok) { const b = Number(await r.json()); if (Number.isFinite(b)) return b >= MAX_BYTES; }
      else if (r.status !== 404) throw new Error('size ' + r.status);
      return await count('limit=1', 'estimated') >= MAX_ROWS;
    });
    if (full) { console.error('[api/readings] storage cap reached (READINGS_MAX_MB / READINGS_MAX_ROWS)'); return json(507, { ok: false, error: 'storage full' }); }
    if (isBatch) {
      // Mỗi thiết bị ≤ BACKFILL_MAX_PER_DEVICE, toàn site ≤ BACKFILL_TOTAL_MAX trải bài cũ
      if (await count(`device_id=eq.${deviceId}&source=eq.backfill`) + rows.length > BACKFILL_MAX_PER_DEVICE) return json(429, { ok: false, error: 'backfill limit' });
      if (await cached('rd:bftotal', 30000, () => count('source=eq.backfill')) + rows.length > BACKFILL_TOTAL_MAX) return json(429, { ok: false, error: 'backfill limit' });
    } else {
      // Theo device_id (đếm trong DB, không cần lưu IP) + trần trải bài mới toàn site trong 24 giờ (nhớ 15 giây)
      const since = new Date(Date.now() - RATE_MIN * 60000).toISOString();
      if (await count(`device_id=eq.${deviceId}&source=eq.live&created_at=gte.${encodeURIComponent(since)}`) >= RATE_MAX) return json(429, { ok: false, error: 'rate limited' });
      const day = new Date(Date.now() - 864e5).toISOString();
      if (await cached('rd:day', 15000, () => count(`source=eq.live&created_at=gte.${encodeURIComponent(day)}`)) >= DAILY_MAX) return json(429, { ok: false, error: 'busy' });
    }
  } catch (e) {
    return json(503, { ok: false, error: 'storage unavailable' });
  }

  // Trùng (cùng device_id + client_ts) thì bỏ qua → gửi lại bao nhiêu lần cũng không nhân đôi
  let ins;
  try {
    ins = await fetchT(base + '?on_conflict=device_id,client_ts', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify(isBatch ? rows : rows[0])
    }, 15000);
  } catch { return json(503, { ok: false, error: 'storage unavailable' }); }
  if (!ins.ok) return json(502, { ok: false, error: 'storage error', status: ins.status });
  return json(201, { ok: true, received: rows.length, skipped: isBatch ? body.batch.length - rows.length : 0 });
}

export function GET() {
  return json(405, { ok: false, error: 'method not allowed' });
}
