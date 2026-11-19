// POST /api/readings — lưu một trải bài ẩn danh vào Supabase.
// - Không lưu IP / email / tên. device_id là UUID ngẫu nhiên do trình duyệt tự sinh.
// - Khoá Supabase (service role) chỉ nằm ở biến môi trường server, trình duyệt không bao giờ thấy.
// - Chống spam / làm đầy database (device_id do client tự đặt nên KHÔNG dùng làm hàng rào duy nhất):
//   1) Vercel Firewall rate limit theo IP (scripts/setup-firewall.mjs) — chặn trước khi tới function
//   2) giới hạn trong RAM theo IP + theo instance — từ chối trước khi gọi Supabase
//   3) trần toàn hệ thống: số trải bài mới mỗi ngày, DUNG LƯỢNG database (MB), tổng số bản ghi "lịch sử cũ"
//   4) nhánh đồng bộ lịch sử cũ (batch) tự đóng sau BACKFILL_UNTIL
//   Mọi truy cập Supabase qua hàm RPC (POST, tham số trong body; không query string, không SQL động):
//   readings_counts (dung lượng DB + các bộ đếm) và readings_insert — migration 20261119130000_rpc_body_only.sql.
// Biến môi trường: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   (tuỳ chọn) READINGS_DAILY_MAX, READINGS_MAX_MB, BACKFILL_UNTIL (YYYY-MM-DD), BACKFILL_TOTAL_MAX
import { json, clientIp, sameOrigin, limited, readText, fetchT } from './_guard.js';

const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : d);
const RATE_MAX = 20, RATE_MIN = 10;                                  // mỗi device_id: 20 lần / 10 phút
const DAILY_MAX = num(process.env.READINGS_DAILY_MAX, 1500);          // trải bài mới (live) toàn site mỗi 24 giờ
const MAX_BYTES = num(process.env.READINGS_MAX_MB, 350) * 1048576;    // ngừng nhận khi database ≥ 350MB (gói free 500MB)
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

  // Supabase chỉ qua hàm RPC: POST + tham số trong BODY (không ghép giá trị vào query string).
  // Hàm có tham số kiểu rõ ràng, không SQL động — supabase/migrations/20261119130000_rpc_body_only.sql
  const rpc = async (fn, args, ms) => {
    const r = await fetchT(url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(args) }, ms);
    if (!r.ok) throw new Error(fn + ' ' + r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };

  try {
    // Mọi con số cần để chặn spam / làm đầy DB lấy trong MỘT lần gọi (readings_counts): dung lượng DB,
    // trải bài của thiết bị trong RATE_MIN phút, trải bài mới toàn site 24 giờ, số trải bài cũ đã đồng bộ.
    const c = await rpc('readings_counts', { p_device: deviceId, p_rate_minutes: RATE_MIN });
    const n = k => { const v = Number(c?.[k]); if (!Number.isFinite(v)) throw new Error('counts ' + k); return v; };   // thiếu số → lỗi, KHÔNG coi là 0
    if (n('size_bytes') >= MAX_BYTES) { console.error('[api/readings] storage cap reached (READINGS_MAX_MB)'); return json(507, { ok: false, error: 'storage full' }); }
    if (isBatch) {
      // Mỗi thiết bị ≤ BACKFILL_MAX_PER_DEVICE, toàn site ≤ BACKFILL_TOTAL_MAX trải bài cũ
      if (n('device_backfill') + rows.length > BACKFILL_MAX_PER_DEVICE) return json(429, { ok: false, error: 'backfill limit' });
      if (n('total_backfill') + rows.length > BACKFILL_TOTAL_MAX) return json(429, { ok: false, error: 'backfill limit' });
    } else {
      // Theo device_id (đếm trong DB, không cần lưu IP) + trần trải bài mới toàn site trong 24 giờ
      if (n('device_recent') >= RATE_MAX) return json(429, { ok: false, error: 'rate limited' });
      if (n('live_24h') >= DAILY_MAX) return json(429, { ok: false, error: 'busy' });
    }
  } catch (e) {
    return json(503, { ok: false, error: 'storage unavailable' });
  }

  // Trùng (cùng device_id + client_ts) thì bỏ qua → gửi lại bao nhiêu lần cũng không nhân đôi
  let inserted;
  try {
    inserted = Number(await rpc('readings_insert', { p_rows: rows }, 15000));
  } catch (e) {
    return /readings_insert \d/.test(String(e.message)) ? json(502, { ok: false, error: 'storage error' }) : json(503, { ok: false, error: 'storage unavailable' });
  }
  return json(201, { ok: true, received: rows.length, inserted: Number.isFinite(inserted) ? inserted : undefined, skipped: isBatch ? body.batch.length - rows.length : 0 });
}

export function GET() {
  return json(405, { ok: false, error: 'method not allowed' });
}
