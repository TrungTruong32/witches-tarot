import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import { SPREAD_LAYOUT } from './spreads';
import { boardWidth, freeLayout, layoutGeom, SPREAD_UI } from './spreadUi';

type Legacy = { SPREAD_UI: unknown; freeLayout(n: number): unknown; layoutGeom(p: unknown): unknown };
const L = loadLegacy<Legacy>(['CARD_H', 'ROW3', 'SPREAD_LAYOUT', 'SPREAD_UI', 'freeLayout', 'layoutGeom']);

describe('spread UI helpers match legacy', () => {
  it('SPREAD_UI is identical', () => expect(JSON.parse(JSON.stringify(SPREAD_UI))).toEqual(JSON.parse(JSON.stringify(L.SPREAD_UI))));
  it('layoutGeom for every spread layout', () => {
    for (const [k, pts] of Object.entries(SPREAD_LAYOUT)) expect(layoutGeom(pts), k).toEqual(L.layoutGeom(pts));
  });
  it('celtic keeps the rotated slot', () => expect(layoutGeom(SPREAD_LAYOUT.celtic!).items[1]!.r).toBe(true));
  it('freeLayout 1..12', () => {
    for (let n = 1; n <= 12; n++) expect(freeLayout(n), String(n)).toEqual(L.freeLayout(n));
  });
  it('boardWidth follows the renderBoard formula', () => {
    const w = (W: number) => boardWidth({ W, H: 1, ar: '', items: [] });
    expect(w(1)).toBe('120px');
    expect(w(3)).toBe(Math.round(3 * 96) + 'px');
    expect(w(6)).toBe(Math.round(6 * 82) + 'px');
  });
});
