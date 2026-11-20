import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { deckCards } from '../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../tests/fixtures/makeDb';
import { createCardSearch, fold } from './search';
import type { Card } from './types';

type Legacy = { searchCards(q: string, limit?: number): Card[]; fold(t: string): string };
let L: Legacy;
let lctx: Record<string, unknown>;

beforeAll(async () => {
  const db: Database = new (await sqlJs()).Database(await makeDb(deckCards));
  ({ fns: L, ctx: lctx } = loadLegacyWithContext<Legacy>(
    ['SEARCH_COLS', 'queryCards', 'fold', 'ROMAN', 'SUIT_ALIAS', 'COURT_ALIAS', 'RANK_WORDS', 'MAJOR_ALIAS', 'STOP',
      'searchIndex', 'buildSearchIndex', 'parseCardQuery', 'scoreCard', 'searchCards'],
    { db, selectedDeck: 'Witches Tarot' },
  ));
});

const QUERIES = ['1', '10', '13', 'xiii', 'xv', 'át chén', 'ace of cups', 'a cups', 'vua kiếm', 'king swords', 'hoàng hậu', 'tiểu đồng kiếm',
  'tower', 'tòa tháp', 'devil', 'ác quỷ', 'phán xét', 'the', '', 'zzz', 'kie', 'pent', 'sụp đổ', 'hình', '2 chén', 'ba gậy', '0'];

describe('smart card search matches legacy searchCards', () => {
  for (const deck of ['Witches Tarot', 'Rider-Waite']) {
    for (const limit of [8, 78]) {
      it(`${deck}, limit ${limit}`, () => {
        lctx.selectedDeck = deck;
        lctx.searchIndex = null; // bỏ cache chỉ mục của bộ trước
        const search = createCardSearch(deckCards.filter(c => c.deck === deck));
        for (const q of QUERIES) expect(search(q, limit).map(c => c.id), `${deck} "${q}"`).toEqual(L.searchCards(q, limit).map(c => c.id));
      });
    }
  }
  it('finds the expected cards (guards against comparing two empty lists)', () => {
    const search = createCardSearch(deckCards.filter(c => c.deck === 'Witches Tarot'));
    expect(search('vua kiếm')[0]?.ten).toBe('King of Swords');
    expect(search('át chén')[0]?.ten).toBe('Ace of Cups');
    expect(search('xv')[0]?.ten).toBe('The Shadow Side');
    expect(search('ác quỷ')[0]?.ten).toBe('The Shadow Side');
    expect(search('1').map(c => c.ten)).not.toContain('Ten of Cups');
  });
  it('default limit is 8 and an empty query returns nothing', () => {
    const search = createCardSearch(deckCards);
    expect(search('of').length).toBeLessThanOrEqual(8);
    expect(search('   ')).toEqual([]);
  });
  it('fold matches legacy', () => {
    for (const t of ['Át Chén', 'Đồng Xu', 'The  Fool!', '', 'Thiên-Bình']) expect(fold(t)).toBe(L.fold(t));
  });
});
