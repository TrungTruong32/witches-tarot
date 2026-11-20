import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import { deckCards } from '../../tests/fixtures/deck';
import { dailyKey, hashStr, pickDailyCard } from './daily';

const L = loadLegacy<{ hashStr(s: string): number }>(['hashStr']);

describe('daily card', () => {
  it('dailyKey is Y-M-D without zero padding (legacy format, used in storage keys)', () => {
    expect(dailyKey(new Date(2026, 0, 5))).toBe('2026-1-5');
    expect(dailyKey(new Date(2026, 10, 20))).toBe('2026-11-20');
  });
  it('hashStr matches legacy', () => {
    for (const s of ['', 'a', '2026-1-5|Witches Tarot', 'Tình yêu|Rider-Waite']) expect(hashStr(s)).toBe(L.hashStr(s));
  });
  it('picks rows[hash(day|deck) % n] like legacy renderDaily', () => {
    for (const d of [new Date(2026, 0, 5), new Date(2026, 5, 30), new Date(2027, 11, 31)])
      for (const deck of ['Witches Tarot', 'Rider-Waite']) {
        const rows = deckCards.filter(c => c.deck === deck);
        expect(pickDailyCard(rows, deck, d)).toBe(rows[L.hashStr(dailyKey(d) + '|' + deck) % rows.length]);
      }
    expect(pickDailyCard([], 'Witches Tarot')).toBeNull();
  });
});
