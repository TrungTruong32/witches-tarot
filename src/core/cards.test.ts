import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx } from '../../tests/fixtures/cards';
import {
  astroGlyph, cardNumber, cardText, dignity, elementOfSuit, isMajorCard, romanToInt,
  ELEMENTS, MAJOR_NAMES, NUMEROLOGY, NUMEROLOGY_EN,
} from './cards';
import type { Card, Element } from './types';

type Legacy = {
  elementOfSuit(bo: string): string | null; astroGlyph(t: string): string; isMajorCard(c: object): boolean;
  romanToInt(s: string): number | null; cardNumber(c: object): number | null; dignity(a: string | null, b: string | null): string | null;
  cardText(c: object): object; ELEMENTS: object; NUMEROLOGY: object; NUMEROLOGY_EN: object; MAJOR_NAMES: string[];
};
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['ELEMENTS', 'NUMEROLOGY_EN', 'NUMEROLOGY', 'elementOfSuit', 'ASTRO_GLYPHS', 'astroGlyph', 'MAJOR_NAMES', 'isMajorCard', 'romanToInt', 'cardNumber', 'dignity', 'cardText'],
  { lang: 'vi', CARD_EN: null },
);

const cards = Object.values(fx);
const BOS = ['Gậy', 'Chén', 'Kiếm', 'Đồng tiền', 'Major Arcana', '', 'Bo Wands', 'Bo An Chinh'];
const SOS = ['0', 'I', 'XXI', 'Ace', 'Át', '10', 'Page', 'King', 'xyz'];

describe('card correspondences match legacy', () => {
  it('constant tables are identical', () => {
    expect(ELEMENTS).toEqual(L.ELEMENTS);
    expect(NUMEROLOGY).toEqual(L.NUMEROLOGY);
    expect(NUMEROLOGY_EN).toEqual(L.NUMEROLOGY_EN);
    expect(MAJOR_NAMES).toEqual(L.MAJOR_NAMES);
  });
  it('elementOfSuit / isMajorCard', () => {
    for (const bo of [...BOS, ...cards.map(c => c.bo)]) {
      expect(elementOfSuit(bo), bo).toBe(L.elementOfSuit(bo));
      expect(isMajorCard({ bo }), bo).toBe(L.isMajorCard({ bo }));
    }
  });
  it('romanToInt / cardNumber', () => {
    for (const so of SOS) {
      expect(romanToInt(so), so).toBe(L.romanToInt(so));
      for (const bo of ['Bo An Chinh', 'Bo Cups']) expect(cardNumber({ bo, so }), bo + so).toBe(L.cardNumber({ bo, so }));
    }
    for (const c of cards) expect(cardNumber(c)).toBe(L.cardNumber(c));
  });
  it('dignity for all element pairs and null', () => {
    const els: (Element | null)[] = ['fire', 'water', 'air', 'earth', null];
    for (const a of els) for (const b of els) expect(dignity(a, b), `${a}-${b}`).toBe(L.dignity(a, b));
  });
  it('astroGlyph', () => {
    for (const t of ['Cung Bạch Dương.', 'Mặt Trăng', 'xyz', 'hỏa tinh', '']) expect(astroGlyph(t), t).toBe(L.astroGlyph(t));
  });
});

describe('cardText', () => {
  const en = { [fx.fool.id]: { kw: 'kwEN', up: 'upEN', rev: 'revEN' }, [fx.rwFool.id]: { kw: 'x', up: 'x', rev: 'x' } };
  const nullDeck: Card = { ...fx.fool, deck: null };
  it('matches legacy in both languages, with and without the EN map', () => {
    for (const lang of ['vi', 'en'] as const) for (const map of [null, en]) {
      ctx.lang = lang; ctx.CARD_EN = map;
      for (const c of [fx.fool, fx.rwFool, nullDeck, fx.threeCups]) expect(cardText(c, lang, map)).toEqual(L.cardText(c));
    }
  });
  it('applies EN only to the Witches deck (or unknown deck)', () => {
    expect(cardText(fx.fool, 'en', en).y_nghia_xuoi).toBe('upEN');
    expect(cardText(nullDeck, 'en', en).nghia_nguoc).toBe('revEN');
    expect(cardText(fx.rwFool, 'en', en).y_nghia_xuoi).toBe(fx.rwFool.y_nghia_xuoi);
    expect(cardText(fx.fool, 'vi', en).y_nghia_xuoi).toBe(fx.fool.y_nghia_xuoi);
  });
});
