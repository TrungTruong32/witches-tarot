import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx, withOrientation as o } from '../../tests/fixtures/cards';
import { MAJOR_NAMES } from './cards';
import { buildUserPrompt, promptMeaning, type UserPromptInput } from './prompt';
import { defsFor } from './spreads';
import type { CardEnMap, Lang, SpreadCard } from './types';

type Legacy = { buildUserPrompt(): string; promptMeaning(t: string): string };
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['ELEMENTS', 'NUMEROLOGY_EN', 'NUMEROLOGY', 'elementOfSuit', 'MAJOR_NAMES', 'COURT_RE', 'isMajorCard', 'romanToInt',
    'cardNumber', 'dignity', 'computeSpreadFacts', 'majorNameIn', 'factLines', 'cardText',
    'SPREADS', 'SPREAD_BY_KEY', 'posDesc', 'readingDecks', 'promptMeaning', 'buildUserPrompt'],
  { lang: 'vi', db: null, CARD_EN: null, spread: [], spreadKey: 'free', spreadPositions: null, questionInput: { value: '' } },
);
const majorName = (n: number) => MAJOR_NAMES[n] ?? null;

const longWithSections = ['Dẫn nhập: mở đầu ' + 'a'.repeat(300), 'Tổng quan: ' + 'b'.repeat(400), 'Công việc: ' + 'c'.repeat(800)].join('\n');
const longPlain = 'chữ '.repeat(600);
const en: CardEnMap = { [fx.fool.id]: { kw: 'kwEN', up: 'upEN', rev: 'revEN' } };

interface Case { question: string; cards: SpreadCard[]; spreadKey: string; positions: boolean; cardEn: CardEnMap | null }
const CASES: Record<string, Case> = {
  emptyQuestion: { question: '', cards: [o(fx.fool, 'xuoi'), o(fx.aceWands, 'nguoc')], spreadKey: 'free', positions: false, cardEn: null },
  multiDeck: { question: 'Công việc?', cards: [o(fx.fool, 'xuoi'), o(fx.rwFool, 'nguoc')], spreadKey: 'free', positions: false, cardEn: en },
  celtic: { question: 'Tình yêu?', cards: [fx.fool, fx.tower, fx.aceWands, fx.threeWands, fx.threeCups, fx.kingSwords, fx.queenPentacles, fx.fiveSwords, fx.rwFool, fx.threeCups].map((c, i) => o(c, i % 2 ? 'nguoc' : 'xuoi')), spreadKey: 'celtic', positions: true, cardEn: en },
  freeSingle: { question: 'Hôm nay?', cards: [o(fx.tower, 'nguoc')], spreadKey: 'free', positions: false, cardEn: null },
  longSections: { question: 'q', cards: [o({ ...fx.threeCups, y_nghia_xuoi: longWithSections }, 'xuoi')], spreadKey: 'one', positions: true, cardEn: null },
  longPlain: { question: 'q', cards: [o({ ...fx.threeCups, nghia_nguoc: longPlain }, 'nguoc')], spreadKey: 'one', positions: true, cardEn: null },
};

describe('buildUserPrompt matches legacy', () => {
  for (const [name, c] of Object.entries(CASES)) {
    for (const lang of ['vi', 'en'] as const) {
      it(`${name} (${lang})`, () => {
        const positions = c.positions ? defsFor(c.spreadKey, lang as Lang) : null;
        Object.assign(ctx, { lang, CARD_EN: c.cardEn, spread: c.cards, spreadKey: c.spreadKey, spreadPositions: positions, questionInput: { value: c.question } });
        const input: UserPromptInput = { question: c.question, cards: c.cards, spreadKey: c.spreadKey, positions, lang, cardEn: c.cardEn, majorName };
        expect(buildUserPrompt(input)).toBe(L.buildUserPrompt());
      });
    }
  }
  it('promptMeaning truncation paths match legacy', () => {
    for (const t of ['', 'ngắn', longWithSections, longPlain]) expect(promptMeaning(t)).toBe(L.promptMeaning(t));
    expect(promptMeaning(longPlain).endsWith('…')).toBe(true);
  });
});
