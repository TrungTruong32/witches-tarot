import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx, withOrientation as o } from '../../tests/fixtures/cards';
import { MAJOR_NAMES } from './cards';
import { computeSpreadFacts, factLines } from './facts';
import type { SpreadCard } from './types';

type Legacy = { computeSpreadFacts(c: SpreadCard[]): unknown; factLines(c: SpreadCard[], f: unknown): string[] };
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['ELEMENTS', 'NUMEROLOGY_EN', 'NUMEROLOGY', 'elementOfSuit', 'MAJOR_NAMES', 'COURT_RE', 'isMajorCard', 'romanToInt',
    'cardNumber', 'dignity', 'computeSpreadFacts', 'majorNameIn', 'factLines'],
  { lang: 'vi', db: null },
);
const majorName = (n: number) => MAJOR_NAMES[n] ?? null;
const unknown: SpreadCard = { ...o(fx.threeCups, 'xuoi'), id: 999, bo: 'Oracle', so: '3', ten: 'Mystery' };

const CASES: Record<string, SpreadCard[]> = {
  empty: [],
  one: [o(fx.fool, 'xuoi')],
  threeUpright: [o(fx.aceWands, 'xuoi'), o(fx.threeCups, 'xuoi'), o(fx.tower, 'xuoi')],
  reversedHeavy: [o(fx.aceWands, 'nguoc'), o(fx.fiveSwords, 'nguoc'), o(fx.threeCups, 'xuoi'), o(fx.fool, 'xuoi')],
  courtsAndRepeat: [o(fx.kingSwords, 'xuoi'), o(fx.threeWands, 'xuoi'), o(fx.threeCups, 'nguoc'), o(fx.queenPentacles, 'xuoi'), o(fx.aceWands, 'xuoi')],
  celtic: [fx.fool, fx.tower, fx.aceWands, fx.threeWands, fx.threeCups, fx.kingSwords, fx.queenPentacles, fx.fiveSwords, fx.rwFool, fx.threeCups]
    .map((c, i) => o(c, i % 3 ? 'xuoi' : 'nguoc')),
  quintessence: [o(fx.tower, 'xuoi'), o({ ...fx.tower, id: 18, so: 'XX', ten: 'Karma' }, 'xuoi'), o(fx.fiveSwords, 'xuoi')],
  unknownSuit: [o(fx.aceWands, 'xuoi'), unknown, o(fx.tower, 'nguoc')],
  manyMinorsMissingElement: [o(fx.aceWands, 'xuoi'), o(fx.threeWands, 'xuoi'), o(fx.threeCups, 'xuoi'), o(fx.fiveSwords, 'nguoc')],
};

describe('SPREAD FACTS match legacy', () => {
  for (const [name, cards] of Object.entries(CASES)) {
    it(`computeSpreadFacts: ${name}`, () => {
      expect(computeSpreadFacts(cards)).toEqual(L.computeSpreadFacts(cards));
    });
    for (const lang of ['vi', 'en'] as const) {
      it(`factLines ${lang}: ${name}`, () => {
        ctx.lang = lang;
        const lines = factLines(cards, computeSpreadFacts(cards), lang, majorName);
        expect(lines).toEqual(L.factLines(cards, L.computeSpreadFacts(cards)));
      });
    }
  }
  it('quintessence case actually reduces past 21 and names a major', () => {
    const f = computeSpreadFacts(CASES.quintessence as SpreadCard[]);
    expect(f.sum).toBe(41);
    expect(f.quint).toBe(5);
    expect(factLines(CASES.quintessence as SpreadCard[], f, 'en', majorName).at(-1)).toContain('The High Priest');
  });
});
