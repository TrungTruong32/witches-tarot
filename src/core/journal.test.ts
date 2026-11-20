import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { exportStamp, importSummary, journalJson, journalMarkdown, mergeImport, orientLabel, readingHaystack } from './journal';
import type { Reading } from './types';

const NOW = new Date(2026, 10, 20, 9, 5, 7);
class FixedDate extends Date {
  constructor(...a: unknown[]) {
    super(...((a.length ? a : [NOW.getTime()]) as [number]));
  }
}
const card = (ten: string, o: 'xuoi' | 'nguoc') => ({ id: 1, deck: 'Witches Tarot', ten, bo: 'b', so: '0', y_nghia_xuoi: 'x', nghia_nguoc: 'n', tu_khoa: 'k', image_url: 'i', orientation: o });
const readings: Reading[] = [
  { id: 1, ts: 1700000000000, deck: 'Witches Tarot', question: 'Câu hỏi A', provider: 'free · m', text: ' Lời giải A ', cards: [card('The Fool', 'xuoi'), card('The Tower', 'nguoc')], spread: 'ppf', positions: ['Quá khứ', 'Hiện tại'], facts: ['f1', 'f2'], followups: [{ q: 'Hỏi thêm', a: ' Đáp ' }], note: ' ghi chú ' },
  { id: 2, ts: 1710000000000, deck: 'Rider-Waite', question: '', provider: '', text: 'B', cards: [card('Ace', 'xuoi')], spread: 'free' },
  { id: 3, ts: 1705000000000, deck: '', question: 'C', provider: 'gemini', text: '', cards: [], spread: 'celtic' },
];
const daily = { '2026-11-02': ' note hai ', '2026-11-19': 'note mười chín' };

type Legacy = {
  orientLabel(c: unknown): string;
  readingHaystack(r: unknown): string;
  exportStamp(): string;
  exportJournalMarkdown(): Promise<void>;
  exportJournalJson(): Promise<void>;
};
const out: { name: string; text: string }[] = [];
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['SPREADS', 'SPREAD_BY_KEY', 'orientLabel', 'readingHaystack', 'exportStamp', 'exportJournalMarkdown', 'exportJournalJson'],
  {
    lang: 'vi',
    Date: FixedDate,
    idbAllReadings: async () => readings.map(r => ({ ...r })),
    collectDailyNotes: () => daily,
    downloadText: (name: string, text: string) => out.push({ name, text }),
  },
);

describe('journal export matches legacy', () => {
  it('orientLabel / readingHaystack / exportStamp', () => {
    for (const lang of ['vi', 'en'] as const) {
      ctx.lang = lang;
      for (const o of ['xuoi', 'nguoc'] as const) expect(orientLabel({ orientation: o }, lang)).toBe(L.orientLabel({ orientation: o }));
    }
    for (const r of [...readings, { ...readings[1]!, cards: undefined as never }]) expect(readingHaystack(r)).toBe(L.readingHaystack(r));
    expect(exportStamp(NOW)).toBe(L.exportStamp());
    expect(exportStamp(NOW)).toBe('20261120-0905');
  });
  for (const lang of ['vi', 'en'] as const) {
    it(`journalMarkdown (${lang})`, async () => {
      ctx.lang = lang;
      out.length = 0;
      await L.exportJournalMarkdown();
      expect(journalMarkdown(readings, daily, lang, NOW)).toBe(out[0]!.text);
    });
  }
  it('journalJson has the legacy envelope, sorted by ts ascending', async () => {
    out.length = 0;
    await L.exportJournalJson();
    const mine = journalJson(readings, daily, NOW);
    expect(mine).toBe(out[0]!.text);
    const j = JSON.parse(mine);
    expect(Object.keys(j)).toEqual(['app', 'kind', 'version', 'exportedAt', 'readings', 'dailyNotes']);
    expect(j).toMatchObject({ app: 'witches-tarot', kind: 'journal', version: 1 });
    expect(j.readings.map((r: Reading) => r.id)).toEqual([1, 3, 2]);
  });
});

describe('mergeImport', () => {
  const rec = (ts: number, q: string): Reading => ({ ...readings[0]!, id: 77, ts, question: q });
  it('dedupes by ts|question, flags imported, drops id', () => {
    const r = mergeImport([rec(1, 'a')], { readings: [rec(1, 'a'), rec(2, 'a'), rec(2, 'a'), { ts: 'x', cards: [] }, null, { ts: 3, cards: 'no' }, rec(3, 'b')] });
    expect(r.add.map(x => [x.ts, x.question])).toEqual([[2, 'a'], [3, 'b']]);
    expect(r.add.every(x => x.imported === true && !('id' in x))).toBe(true);
    expect(r.skipped).toBe(5);
    expect(r.valid).toBe(true);
  });
  it('accepts a bare array and only the missing daily notes', () => {
    const r = mergeImport([], { readings: [], dailyNotes: { '2026-01-01': 'có rồi', '2026-01-02': 'mới', '2026-01-03': '   ' } }, { '2026-01-01': 'x' });
    expect(r.notes).toEqual({ '2026-01-02': 'mới' });
    expect(mergeImport([], [rec(5, 'z')]).add).toHaveLength(1);
  });
  it('normalises hostile fields and skips unusable records; valid ones stay deep-equal', () => {
    const good = rec(10, 'ok');
    const bad = { ts: 11, cards: [card('A', 'xuoi'), null] };
    const odd = { ts: 12, question: 5, cards: [{ ten: 'T', bo: 7, orientation: 'weird' }], facts: 'str', followups: [{ q: { x: 1 }, a: 3 }, null, 'z'], positions: 'p', text: null };
    const r = mergeImport([], { readings: [good, bad, odd], dailyNotes: { '2026-1-5': 'ok', 'evil': 'x', '2026-1-6': { a: 1 } } });
    expect(r.skipped).toBe(1);
    const goodRest: Partial<Reading> = { ...good };
    delete goodRest.id;
    expect(r.add[0]).toEqual({ ...goodRest, imported: true });
    expect(r.add[1]).toMatchObject({ question: '5', cards: [{ ten: 'T', bo: '7', orientation: 'xuoi' }], facts: [], followups: [{ q: '', a: '3' }], positions: null, text: '' });
    expect(r.notes).toEqual({ '2026-1-5': 'ok' });
  });
  it('rejects non-arrays without throwing', () => {
    for (const bad of [null, undefined, 5, 'x', {}, { readings: 'no' }]) {
      expect(mergeImport([], bad)).toMatchObject({ add: [], notes: {}, skipped: 0, valid: false });
    }
  });
  it('importSummary is the legacy alert text', () => {
    expect(importSummary(2, 1, 3, 'vi')).toBe('Đã nhập 2 lượt trải bài, bỏ qua 3 bản trùng/lỗi, 1 ghi chú hằng ngày.');
    expect(importSummary(2, 1, 3, 'en')).toBe('Imported 2 reading(s), skipped 3 duplicate/invalid, 1 daily note(s).');
  });
});
