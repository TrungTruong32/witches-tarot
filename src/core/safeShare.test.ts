import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx } from '../../tests/fixtures/cards';
import { sanitizeShared } from './safeShare';
import type { ShareData } from './share';
import type { Card } from './types';

const DB: Card[] = [fx.fool, fx.tower, fx.rwFool];
const byId = (id: number) => DB.find(c => c.id === id) ?? null;

async function legacyResult(data: unknown): Promise<unknown> {
  let loaded: unknown = null;
  const { fns } = loadLegacyWithContext<{ loadSharedFromHash(): Promise<boolean> }>(
    ['SPREAD_SAFE_DECKS', 'SPREADS', 'SPREAD_BY_KEY', 'SPREAD_DEFS', 'loadSharedFromHash'],
    {
      lang: 'vi',
      location: { hash: '#r=zzz' },
      decodeShare: async () => data,
      cardByIdAnyDeck: (id: number) => byId(id),
      loadReading: (r: unknown) => {
        loaded = r;
      },
      document: { createElement: () => ({}) },
      aiOutput: { firstChild: null, appendChild() {}, prepend() {} },
    },
  );
  await fns.loadSharedFromHash();
  return loaded;
}

const norm = (o: unknown) => JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? null : v)));
const base: ShareData = {
  q: 'Hỏi', d: 'Witches Tarot', p: 'ppf', a: 'Đáp',
  c: [[1, 0], [17, 1], [-1, 1, 'Lá lạ', 'https://www.tarot.vn/x.jpg', 'Bo X', '7', 'Rider-Waite']],
};

describe('sanitizeShared', () => {
  it('returns null when c is not an array', () => {
    expect(sanitizeShared({ ...base, c: 'x' as never }, byId)).toBeNull();
    expect(sanitizeShared(null as never, byId)).toBeNull();
  });
  it('matches the legacy mapping for DB, custom and old-object cards', async () => {
    const old = {
      q: 'q', d: 'Rider-Waite', p: ['Quá khứ', 'Hiện tại', 'Tương lai'], a: 'a',
      c: [{ i: 1, o: 'nguoc' }, { i: -1, o: 'xuoi', t: 'T', u: 'https://tarot.vn/a.png', b: 'B', s: '1', k: 'Witches Tarot' }],
    };
    const celtic = { ...base, p: ['Hiện tại', 'Thử thách', 'Nền tảng', 'Quá khứ', 'Mục tiêu', 'Tương lai gần', 'Bản thân', 'Môi trường', 'Hy vọng & nỗi sợ', 'Kết quả'] };
    const celticLabels = (await import('./spreads')).defsFor('celtic', 'vi')!;
    const inputs = [{ ...base, p: celticLabels }, celtic, { ...base, c: [[1, 0, '', '', '', '', 'Rider-Waite']] }, base, old, { ...base, p: 'zzz', d: 'Evil' }, { ...base, c: [[999, 0]] }, { ...base, c: [[101, 0, '', '', '', '', 'Witches Tarot']] }];
    for (const d of inputs) {
      const r = sanitizeShared(d as ShareData, byId)!;
      const l = (await legacyResult(d)) as { question: string; deck: string; text: string; cards: Record<string, unknown>[]; spread: string };
      expect(r.question).toBe(l.question);
      expect(r.deck).toBe(l.deck);
      expect(r.text).toBe(l.text);
      expect(r.spreadKey).toBe(l.spread);
      const strip = ({ y_nghia_xuoi, nghia_nguoc, ...rest }: Card & { orientation: string }) => (y_nghia_xuoi === '' && nghia_nguoc === '' ? rest : { y_nghia_xuoi, nghia_nguoc, ...rest });
      expect(norm(r.cards.map(c => ({ ...strip(c), id: c.id < 0 ? null : c.id })))).toEqual(norm(l.cards));
    }
  });
  it('keeps hostile ten verbatim (escaping happens at render) but cuts it to 80', () => {
    const r = sanitizeShared({ ...base, c: [[-1, 0, '<img src=x onerror=alert(1)>' + 'a'.repeat(100)]] }, byId)!;
    expect(r.cards[0]!.ten.startsWith('<img src=x onerror=alert(1)>')).toBe(true);
    expect(r.cards[0]!.ten).toHaveLength(80);
    expect(r.cards[0]!.id).toBe(-1);
  });
  it('drops image_url unless it is a tarot.vn https URL', () => {
    const img = (u: string) => sanitizeShared({ ...base, c: [[-1, 0, 't', u]] }, byId)!.cards[0]!.image_url;
    expect(img('javascript:alert(1)')).toBe('');
    expect(img('http://tarot.vn/a.png')).toBe('');
    expect(img('https://evil.example/a.png')).toBe('');
    expect(img('https://www.tarot.vn/a.png')).toBe('https://www.tarot.vn/a.png');
  });
  it('clamps cards to 15, question to 500 and answer to 14000', () => {
    const many = Array.from({ length: 30 }, () => [1, 0] as [number, 0]);
    const r = sanitizeShared({ ...base, q: 'q'.repeat(600), a: 'a'.repeat(15000), c: many }, byId)!;
    expect(r.cards).toHaveLength(15);
    expect(r.question).toHaveLength(500);
    expect(r.text).toHaveLength(14000);
  });
});
