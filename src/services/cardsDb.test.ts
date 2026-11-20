import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx } from '../../tests/fixtures/cards';
import { makeDb, sqlJs } from '../../tests/fixtures/makeDb';
import { openCardsDb, type CardsDb } from './cardsDb';

type Legacy = { queryCards(category: string | null, query: string | null, limit?: number): unknown[] };

let mine: CardsDb;
let legacyDb: Database;
let L: Legacy;
let lctx: Record<string, unknown>;

beforeAll(async () => {
  const bytes = await makeDb(Object.values(fx));
  const SQL = await sqlJs();
  mine = openCardsDb(bytes, SQL);
  legacyDb = new SQL.Database(bytes);
  ({ fns: L, ctx: lctx } = loadLegacyWithContext<Legacy>(['SEARCH_COLS', 'queryCards'], { db: legacyDb, selectedDeck: null }));
});

describe('card DB queries match legacy queryCards', () => {
  const cases: { name: string; deck: string | null; category?: string; text?: string; limit?: number }[] = [
    { name: 'no filter', deck: null },
    { name: 'deck', deck: 'Witches Tarot' },
    { name: 'deck + category', deck: 'Witches Tarot', category: 'Bo Wands' },
    { name: 'category all', deck: 'Witches Tarot', category: 'all' },
    { name: 'text', deck: null, text: 'wands' },
    { name: 'text with % (LIKE wildcard, same as legacy)', deck: null, text: '%' },
    { name: 'text in Vietnamese meaning', deck: 'Witches Tarot', text: 'xuôi The' },
    { name: 'limit', deck: null, limit: 2 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      lctx.selectedDeck = c.deck;
      const expected = L.queryCards(c.category ?? null, c.text ?? null, c.limit);
      expect(mine.query({ deck: c.deck, category: c.category, text: c.text, limit: c.limit })).toEqual(JSON.parse(JSON.stringify(expected)));
    });
  }
});

describe('suit tiles queries match legacy', () => {
  it('suits / count / topCards', () => {
    const { fns } = loadLegacyWithContext<{
      boCounts(d: string): unknown[]; deckTotal(d: string): number; suitTopCards(d: string, bo: string): unknown[];
    }>(['boCounts', 'deckTotal', 'suitTopCards'], { db: legacyDb });
    for (const d of ['Witches Tarot', 'Rider-Waite']) {
      expect(mine.suits(d)).toEqual(JSON.parse(JSON.stringify(fns.boCounts(d))));
      expect(mine.count(d)).toBe(fns.deckTotal(d));
      for (const bo of ['Bo An Chinh', 'Bo Cups', 'Bo Nope']) expect(mine.topCards(d, bo)).toEqual(JSON.parse(JSON.stringify(fns.suitTopCards(d, bo))));
    }
  });
});

describe('other lookups', () => {
  it('decks: Witches Tarot first, then alphabetical', () => {
    expect(mine.decks()).toEqual(['Witches Tarot', 'Rider-Waite']);
  });
  it('majorNameIn uses the deck’s own major names', () => {
    expect(mine.majorNameIn('Rider-Waite', 0)).toBe('The Fool (RW)');
    expect(mine.majorNameIn('Witches Tarot', 16)).toBe('The Tower');
    expect(mine.majorNameIn('Witches Tarot', 21)).toBeNull();
    expect(mine.majorNameIn('Nope', 0)).toBeNull();
  });
  it('byId', () => {
    expect(mine.byId(fx.threeCups.id)?.ten).toBe('Three of Cups');
    expect(mine.byId(424242)).toBeNull();
  });
});
