import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { CARD_H, defsFor, posDesc, SPREAD_LAYOUT, SPREADS, spreadByKey } from './spreads';

type Legacy = { SPREADS: unknown[]; SPREAD_LAYOUT: object; CARD_H: number; posDesc(k: string, i: number): string; defsFor(k: string): string[] | null };
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['SPREADS', 'SPREAD_BY_KEY', 'SPREAD_DEFS', 'SPREAD_DEFS_EN', 'defsFor', 'posDesc', 'CARD_H', 'ROW3', 'SPREAD_LAYOUT'],
  { lang: 'vi' },
);

describe('spreads match legacy', () => {
  it('definitions and layouts are identical', () => {
    expect(JSON.parse(JSON.stringify(SPREADS))).toEqual(JSON.parse(JSON.stringify(L.SPREADS)));
    expect(SPREAD_LAYOUT).toEqual(JSON.parse(JSON.stringify(L.SPREAD_LAYOUT)));
    expect(CARD_H).toBe(L.CARD_H);
  });
  it('defsFor and posDesc for every key, index and language', () => {
    for (const lang of ['vi', 'en'] as const) {
      ctx.lang = lang;
      for (const s of SPREADS) {
        expect(defsFor(s.k, lang)).toEqual(L.defsFor(s.k));
        for (let i = 0; i <= (s.pos?.length ?? 0); i++) expect(posDesc(s.k, i, lang)).toBe(L.posDesc(s.k, i));
      }
      expect(defsFor('nope', lang)).toBeNull();
    }
  });
  it('has the 12 spread kinds plus free', () => {
    expect(SPREADS.length).toBe(L.SPREADS.length);
    expect(spreadByKey('celtic')?.pos?.length).toBe(10);
  });
});
