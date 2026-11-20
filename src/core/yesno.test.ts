import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx } from '../../tests/fixtures/cards';
import { deckCards } from '../../tests/fixtures/deck';
import { firstSentence, localVerdict, parseVerdict, YN_MAYBE, yesNoMessages, ynClass } from './yesno';
import type { Card, CardEnMap } from './types';

type Legacy = {
  YN_MAYBE: RegExp;
  firstSentence(s: string): string;
  localVerdict(c: Card, rev: boolean): { verdict: string; cls: string };
  ynClass(v: string): string;
  drawYesno(): Promise<void>;
};
const cardEn: CardEnMap = {
  1: { kw: 'new start', up: 'Fresh beginnings.', rev: 'Recklessness.' },
  17: { kw: 'upheaval', up: 'Sudden change.', rev: 'Averted disaster.' },
};
const calls: unknown[][] = [];
const fakeEl = (value = '') => ({ value, className: '', textContent: '', innerHTML: '', classList: { add() {} }, querySelector: () => null, addEventListener() {} });
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['YN_MAYBE', 'firstSentence', 'localVerdict', 'ynClass', 'cardText', 'promptMeaning', 'drawYesno'],
  {
    lang: 'vi',
    CARD_EN: cardEn,
    db: {},
    queryCards: () => [],
    aiConfigured: () => true,
    $: () => fakeEl(),
    haptic() {},
    ensureAudio() {},
    playTick() {},
    burstAt() {},
    escapeHtml: (s: string) => s,
    openLightbox() {},
    renderMarkdown: (s: string) => s,
    chatComplete: async (m: unknown) => {
      calls.push(m as unknown[]);
      throw new Error('stop');
    },
  },
);

const cases: [Card, boolean][] = [
  [fx.fool, false],
  [fx.tower, true],
  [{ ...fx.fool, ten: 'The High Priestess' }, false],
  [{ ...fx.fool, ten: 'Two of Cups', bo: '' }, true],
  [{ ...fx.fool, deck: 'Rider-Waite', y_nghia_xuoi: 'Câu một. Câu hai.' }, false],
  [deckCards[3]!, true],
];

describe('yes/no matches legacy', () => {
  it('YN_MAYBE regex source', () => expect(YN_MAYBE.source).toBe(L.YN_MAYBE.source));
  for (const lang of ['vi', 'en'] as const) {
    it(`localVerdict + ynClass (${lang})`, () => {
      ctx.lang = lang;
      for (const [c, rev] of cases) expect(localVerdict(c, rev, lang), c.ten).toEqual(L.localVerdict(c, rev));
      for (const v of ['CÓ', 'KHÔNG', 'CÓ THỂ', 'YES', 'NO', 'MAYBE', '', 'xyz']) expect(ynClass(v), v).toBe(L.ynClass(v));
    });
    it(`yesNoMessages is byte-identical to the inline legacy prompt (${lang})`, async () => {
      ctx.lang = lang;
      for (const [c, rev] of cases) {
        for (const q of ['', 'Tôi nên nhận việc này?']) {
          calls.length = 0;
          const m = Object.create(Math) as Math;
          const vals = [0, rev ? 0.1 : 0.9];
          let k = 0;
          m.random = () => vals[k++ % 2] as number;
          ctx.Math = m;
          ctx.queryCards = () => [c];
          ctx.$ = (id: string) => fakeEl(id === 'yesnoQ' ? q : '');
          await L.drawYesno();
          expect(yesNoMessages(q, c, rev, lang, cardEn), `${c.ten} ${rev} ${lang} ${q}`).toEqual(calls[0]);
        }
      }
    });
  }
  it('firstSentence', () => {
    for (const s of ['Một. Hai.', 'không dấu chấm '.repeat(20), '', 'Hay không?! Có']) expect(firstSentence(s)).toBe(L.firstSentence(s));
  });
});

describe('parseVerdict', () => {
  it('splits the verdict line from the body (legacy upper-cases the verdict)', () => {
    expect(parseVerdict('PHÁN QUYẾT: Có\nVì…')).toEqual({ verdict: 'CÓ', body: 'Vì…' });
    expect(parseVerdict('VERDICT: maybe\nBecause')).toEqual({ verdict: 'MAYBE', body: 'Because' });
    expect(parseVerdict('PHÁN QUYẾT: Có thể\nx').verdict).toBe('CÓ THỂ');
  });
  it('returns an empty verdict when nothing matches', () => {
    expect(parseVerdict('  chỉ là văn bản ')).toEqual({ verdict: '', body: 'chỉ là văn bản' });
  });
});
