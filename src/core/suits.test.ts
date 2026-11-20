import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import { fx } from '../../tests/fixtures/cards';
import { SUIT_META, seoCardPath } from './suits';

const L = loadLegacy<{ SUIT_META: object; seoCardPath(c: object): string }>(['SUIT_META', 'SEO_DECK_SLUG', 'seoCardPath']);

describe('suits', () => {
  it('SUIT_META matches legacy', () => {
    expect(SUIT_META).toEqual(JSON.parse(JSON.stringify(L.SUIT_META)));
  });
  it('seoCardPath matches legacy (Witches, Rider-Waite, unknown deck, empty name)', () => {
    for (const c of [fx.tower, fx.rwFool, { ...fx.fool, deck: 'Oracle' }, { ...fx.fool, ten: '' }]) expect(seoCardPath(c)).toBe(L.seoCardPath(c));
    expect(seoCardPath(fx.tower)).toBe('/la-bai/witches-tarot/the-tower/');
  });
});
