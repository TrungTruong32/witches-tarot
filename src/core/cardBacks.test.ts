import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import { CARD_BACK_KEYS, CARD_BACK_NAMES, cardBackCss, cardBackSvg, normalizeCardBack } from './cardBacks';

type Legacy = { CB: { keys: string[]; svg(k: string): string; css(k: string): string }; CARD_BACK_NAMES: object };
const L = loadLegacy<Legacy>(['CB', 'CARD_BACK_NAMES']);

describe('card backs match legacy', () => {
  it('same keys and names', () => {
    expect([...CARD_BACK_KEYS]).toEqual([...L.CB.keys]);
    expect(CARD_BACK_NAMES).toEqual(JSON.parse(JSON.stringify(L.CARD_BACK_NAMES)));
  });
  it('same SVG and CSS for every design', () => {
    for (const k of CARD_BACK_KEYS) {
      if (k !== 'witches') expect(cardBackSvg(k), k).toBe(L.CB.svg(k));
      expect(cardBackCss(k), k).toBe(L.CB.css(k));
    }
  });
  it('normalizes stored values like legacy initCardBack', () => {
    expect(normalizeCardBack('moon')).toBe('triple');
    expect(normalizeCardBack('night')).toBe('stars');
    expect(normalizeCardBack('plain')).toBe('sacred');
    expect(normalizeCardBack('bogus')).toBe('zodiac');
    expect(normalizeCardBack(null)).toBe('zodiac');
    expect(normalizeCardBack('witches')).toBe('witches');
  });
});
