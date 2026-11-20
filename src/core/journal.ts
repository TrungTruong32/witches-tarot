// Nhật ký: xuất/nhập sao lưu (port từ witches_tarot.html L4376–4552). Hàm thuần — IO (IndexedDB, tải file) nằm ở nơi gọi.
import { spreadByKey } from './spreads';
import type { Lang, Reading, SpreadCard } from './types';

export function orientLabel(c: Pick<SpreadCard, 'orientation'>, lang: Lang): string {
  return lang === 'en' ? (c.orientation === 'nguoc' ? 'Reversed' : 'Upright') : (c.orientation === 'nguoc' ? 'Ngược' : 'Xuôi');
}

/** Chuỗi để lọc/tìm trong lịch sử. */
export function readingHaystack(r: Reading): string {
  return [r.question, r.deck, r.note, r.text, (Array.isArray(r.cards) ? r.cards : []).map(c => c?.ten).join(' ')].join(' \n ').toLowerCase();
}

export function exportStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

export function journalJson(readings: Reading[], dailyNotes: Record<string, string>, now: Date = new Date()): string {
  const sorted = readings.slice().sort((a, b) => a.ts - b.ts);
  const data = { app: 'witches-tarot', kind: 'journal', version: 1, exportedAt: now.toISOString(), readings: sorted, dailyNotes };
  return JSON.stringify(data, null, 2);
}

export function journalMarkdown(readings: Reading[], dailyNotes: Record<string, string>, lang: Lang, now: Date = new Date()): string {
  const en = lang === 'en';
  const loc = en ? 'en-US' : 'vi-VN';
  const L: string[] = [];
  L.push('# ' + (en ? 'Tarot journal' : 'Nhật ký Tarot'), '', '_' + (en ? 'Exported ' : 'Xuất ngày ') + now.toLocaleString(loc) + '_', '');
  readings.slice().sort((a, b) => b.ts - a.ts).forEach(it => {
    const sdef = it.spread ? spreadByKey(it.spread) : undefined;
    L.push('## ' + new Date(it.ts).toLocaleString(loc) + ' — ' + (it.question || (en ? '(no question)' : '(không có câu hỏi)')), '');
    L.push('- ' + (en ? 'Deck' : 'Bộ bài') + ': ' + (it.deck || '—'));
    if (sdef && it.spread !== 'free') L.push('- ' + (en ? 'Spread' : 'Kiểu trải') + ': ' + (en ? sdef.en : sdef.vi));
    if (it.provider) L.push('- AI: ' + it.provider);
    L.push('', '### ' + (en ? 'Cards' : 'Lá bài'));
    const pos = it.positions || [];
    (it.cards || []).forEach((c, i) => L.push((i + 1) + '. ' + (pos[i] ? '**' + pos[i] + '** — ' : '') + c.ten + ' (' + orientLabel(c, lang) + ')'));
    if (it.facts && it.facts.length) {
      L.push('', '### ' + (en ? 'Spread facts' : 'Dữ kiện trải bài'));
      it.facts.forEach(f => L.push('- ' + f));
    }
    L.push('', '### ' + (en ? 'Interpretation' : 'Diễn giải'), '', (it.text || '').trim());
    if (it.followups && it.followups.length) {
      L.push('', '### ' + (en ? 'Follow-up questions' : 'Hỏi tiếp'));
      it.followups.forEach(f => L.push('', '**' + (en ? 'Q' : 'Hỏi') + ':** ' + f.q, '', (f.a || '').trim()));
    }
    if (it.note && it.note.trim()) L.push('', '### 📝 ' + (en ? 'Note' : 'Ghi chú'), '', it.note.trim());
    L.push('', '---', '');
  });
  const days = Object.keys(dailyNotes).sort().reverse();
  if (days.length) {
    L.push('# ' + (en ? 'Daily card notes' : 'Nhật ký lá bài hằng ngày'), '');
    days.forEach(d => L.push('### ' + d, '', (dailyNotes[d] as string).trim(), ''));
  }
  return L.join('\n');
}


const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
const CARD_STR = ['deck', 'ten', 'bo', 'so', 'y_nghia_xuoi', 'nghia_nguoc', 'tu_khoa', 'image_url'] as const;

/** Làm sạch một bản ghi nhập từ file (dữ liệu không tin cậy). null = không dùng được. Bản ghi hợp lệ giữ nguyên (deep-equal). */
function normalizeReading(raw: unknown): Reading | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.ts !== 'number' || !Number.isFinite(r.ts) || !Array.isArray(r.cards)) return null;
  const cards: Record<string, unknown>[] = [];
  for (const c of r.cards as unknown[]) {
    if (!c || typeof c !== 'object' || typeof (c as { ten?: unknown }).ten !== 'string') return null;
    const o: Record<string, unknown> = { ...(c as Record<string, unknown>) };
    for (const k of CARD_STR) if (k in o && typeof o[k] !== 'string') o[k] = str(o[k]);
    o.orientation = o.orientation === 'nguoc' ? 'nguoc' : 'xuoi';
    cards.push(o);
  }
  const out: Record<string, unknown> = { ...r, cards };
  for (const k of ['question', 'deck', 'provider', 'text', 'note', 'spread']) if (k in out && typeof out[k] !== 'string') out[k] = str(out[k]);
  if ('followups' in out) {
    out.followups = Array.isArray(out.followups)
      ? (out.followups as unknown[]).filter(f => f && typeof f === 'object').map(f => ({ ...(f as object), q: str((f as { q?: unknown }).q), a: str((f as { a?: unknown }).a) }))
      : [];
  }
  if ('facts' in out) out.facts = Array.isArray(out.facts) ? (out.facts as unknown[]).filter(x => typeof x === 'string') : [];
  if ('positions' in out) out.positions = Array.isArray(out.positions) ? (out.positions as unknown[]).map(str) : null;
  return out as unknown as Reading;
}

/**
 * Gộp file sao lưu vào dữ liệu hiện có: bỏ bản trùng (cùng ts + câu hỏi) hoặc lỗi, đánh dấu imported, bỏ id.
 * `valid` = false khi file không phải mảng / không có `readings` (nơi gọi báo lỗi như bản cũ).
 * Ghi chú hằng ngày chỉ trả những ngày chưa có trong `existingNotes`.
 */
export function mergeImport(existing: Reading[], file: unknown, existingNotes: Record<string, string> = {}): {
  add: Reading[];
  notes: Record<string, string>;
  skipped: number;
  valid: boolean;
} {
  const obj = file as { readings?: unknown; dailyNotes?: unknown } | null;
  const incoming: unknown[] | null = Array.isArray(file) ? file : obj && typeof obj === 'object' && Array.isArray(obj.readings) ? obj.readings : null;
  if (!incoming) return { add: [], notes: {}, skipped: 0, valid: false };
  const seen = new Set(existing.map(r => r.ts + '|' + (r.question || '')));
  const add: Reading[] = [];
  let skipped = 0;
  for (const raw of incoming) {
    const r = normalizeReading(raw);
    if (!r) { skipped++; continue; }
    const key = r.ts + '|' + (r.question || '');
    if (seen.has(key)) { skipped++; continue; }
    const copy: Reading = { ...r, imported: true };
    delete copy.id;
    seen.add(key);
    add.push(copy);
  }
  const notes: Record<string, string> = {};
  const dn = !Array.isArray(file) && obj ? obj.dailyNotes : null;
  if (dn && typeof dn === 'object') {
    for (const d in dn as Record<string, unknown>) {
      const v0 = (dn as Record<string, unknown>)[d];
      if (typeof v0 !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) continue;
      const v = v0;
      if (v.trim() && !existingNotes[d]) notes[d] = v;
    }
  }
  return { add, notes, skipped, valid: true };
}

/** Nội dung alert sau khi nhập (bản cũ). */
export function importSummary(added: number, notes: number, skipped: number, lang: Lang): string {
  return lang === 'en'
    ? `Imported ${added} reading(s), skipped ${skipped} duplicate/invalid, ${notes} daily note(s).`
    : `Đã nhập ${added} lượt trải bài, bỏ qua ${skipped} bản trùng/lỗi, ${notes} ghi chú hằng ngày.`;
}
