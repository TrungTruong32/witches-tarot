import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { deckCards } from '../../tests/fixtures/deck';
import { drawRandomCards, makeUid, readDrawCount, toSpreadCard } from './draw';
import type { Card, SpreadCard } from './types';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length] as number;
};

describe('drawRandomCards', () => {
  it('matches legacy order and orientation for the same random sequence', () => {
    const cards = deckCards.slice(0, 14);
    const vals = [0.91, 0.12, 0.55, 0.3, 0.77, 0.02, 0.64, 0.48, 0.23, 0.88, 0.39, 0.71, 0.05, 0.6, 0.33, 0.97];
    let k = 0;
    const m = Object.create(Math) as Math;
    m.random = () => vals[k++ % vals.length] as number;
    const { fns } = loadLegacyWithContext<{ drawRandomCards(n: number): SpreadCard[] }>(['drawRandomCards'], {
      queryCards: () => cards.map(c => ({ ...c })),
      Math: m,
    });
    const legacy = fns.drawRandomCards(6);
    const mine = drawRandomCards(cards, 6, seq(vals));
    expect(mine.map(c => [c.id, c.orientation])).toEqual(legacy.map(c => [c.id, c.orientation]));
    expect(mine.some(c => c.orientation === 'nguoc')).toBe(true);
  });
  it('never reverses a card with a blank reversed meaning, and does not mutate input', () => {
    const blank: Card = { ...deckCards[0]!, nghia_nguoc: '  ' };
    const input = [blank, { ...blank, id: 999 }];
    const out = drawRandomCards(input, 5, () => 0.1);
    expect(out).toHaveLength(2);
    expect(out.every(c => c.orientation === 'xuoi')).toBe(true);
    expect(input.map(c => c.id)).toEqual([blank.id, 999]);
  });
});

describe('readDrawCount / uid', () => {
  it('clamps 1..12, default 3', () => {
    expect(readDrawCount('0')).toBe(1);
    expect(readDrawCount('99')).toBe(12);
    expect(readDrawCount('x')).toBe(3);
    expect(readDrawCount('5')).toBe(5);
  });
  it('makeUid increases; toSpreadCard keeps the legacy subset with a fresh uid', () => {
    const a = makeUid();
    expect(makeUid()).toBe(a + 1);
    const src: SpreadCard = { ...deckCards[0]!, mo_ta_hinh_anh: 'x', content: 'y', orientation: 'nguoc', uid: 1 };
    const c = toSpreadCard(src);
    expect(c.uid).toBeGreaterThan(a + 1);
    expect(c).not.toHaveProperty('mo_ta_hinh_anh');
    expect(c).not.toHaveProperty('content');
    expect(c.orientation).toBe('nguoc');
    expect(c.ten).toBe(src.ten);
  });
});
