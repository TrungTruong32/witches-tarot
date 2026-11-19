// Lưu trải bài ẩn danh lên máy chủ (Supabase qua /api/readings).
// Không gửi IP/email/tên; deviceId là UUID ngẫu nhiên của trình duyệt. Ghi chú riêng và đoạn hỏi tiếp KHÔNG được gửi.
// Người dùng tắt được trong Cài đặt trang (tarotCloudSave = '0').
import type { Lang, Reading } from '../core/types';
import { allReadings } from './idb';
import { deviceId, getStr, KEYS, setStr } from './storage';

const BATCH_MAX = 25;
const BATCH_CHARS = 700000;

const cloudSaveOn = () => getStr(KEYS.cloudSave, '1') !== '0';
const onHttp = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
const defaultFetch = (): typeof fetch => globalThis.fetch.bind(globalThis);

export interface CloudPayload {
  client_ts?: number;
  lang: Lang;
  deck: string;
  spread: string;
  question: string;
  cards: { id: number; name: string; suit: string; number: string; orientation: string; position: string | null }[];
  facts: string[];
  ai_answer: string;
  model: string;
  app_version: 'web';
}

export function cloudPayload(r: Reading, lang: Lang): CloudPayload {
  return {
    client_ts: Number.isSafeInteger(r.ts) ? r.ts : undefined,
    lang,
    deck: r.deck,
    spread: r.spread || 'free',
    question: r.question || '',
    cards: (r.cards || []).map((c, i) => ({
      id: c.id,
      name: c.ten,
      suit: c.bo,
      number: String(c.so ?? ''),
      orientation: c.orientation,
      position: r.positions ? r.positions[i] || null : null,
    })),
    facts: r.facts || [],
    ai_answer: r.text || '',
    model: String(r.provider || '').slice(0, 120),
    app_version: 'web',
  };
}

/** Gửi một lượt trải bài (bắn và quên; lỗi mạng bỏ qua vì lịch sử cục bộ vẫn còn). */
export function cloudSaveReading(r: Reading, lang: Lang, f: typeof fetch = defaultFetch()): void {
  if (!cloudSaveOn() || !onHttp() || !r?.cards?.length) return;
  const id = deviceId();
  if (!id) return;
  f('/api/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_id: id, ...cloudPayload(r, lang) }),
    keepalive: true,
  })
    .then(res => {
      if (!res.ok && res.status !== 503) console.warn('Lưu trải bài lên máy chủ thất bại:', res.status);
    })
    .catch(() => {});
}

/**
 * Đồng bộ lịch sử cũ trong máy lên máy chủ (một lần, chạy ngầm). Server bỏ qua trải bài trùng (device_id + thời điểm),
 * nên chạy lại cũng không nhân đôi. 410 = máy chủ đã đóng đồng bộ → coi như xong; 400 = lô hỏng → bỏ lô;
 * lỗi khác → thử lại lần mở app sau.
 */
export async function cloudBackfill(lang: Lang, f: typeof fetch = defaultFetch()): Promise<void> {
  try {
    if (!cloudSaveOn() || !onHttp() || getStr(KEYS.backfill, '') === 'done') return;
    const id = deviceId();
    if (!id) return;
    const all = (await allReadings())
      .filter(r => r && !r.imported && Array.isArray(r.cards) && r.cards.length && Number.isSafeInteger(r.ts))
      .sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < all.length; ) {
      const batch: CloudPayload[] = [];
      let size = 0;
      while (i < all.length && batch.length < BATCH_MAX) {
        const p = cloudPayload(all[i] as Reading, lang);
        const n = JSON.stringify(p).length;
        if (batch.length && size + n > BATCH_CHARS) break;
        batch.push(p);
        size += n;
        i++;
      }
      const res = await f('/api/readings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_id: id, batch }),
      });
      if (res.status === 410) break;
      if (res.status === 400) continue;
      if (!res.ok) return;
    }
    setStr(KEYS.backfill, 'done');
  } catch (e) {
    console.warn('Đồng bộ lịch sử thất bại', e);
  }
}
