import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { moonPhase, moonSvg } from './moon';

type Legacy = { moonPhase(d: Date): unknown; moonSvg(frac: number, cls?: string): string };
const { fns: L } = loadLegacyWithContext<Legacy>(['moonPhase', 'moonSvgSeq', 'moonSvg']);

describe('moon', () => {
  it('moonPhase matches legacy across 2000–2030', () => {
    const dates = [new Date(Date.UTC(2000, 0, 6, 18, 14, 0)), new Date(Date.UTC(1999, 11, 31))];
    for (let i = 0; i < 40; i++) dates.push(new Date(Date.UTC(2000 + Math.floor(i * 0.75), (i * 5) % 12, 1 + ((i * 7) % 28), (i * 13) % 24)));
    for (const d of dates) expect(moonPhase(d), d.toISOString()).toEqual(L.moonPhase(d));
  });
  it('moonSvg matches legacy with the same id sequence', () => {
    let seq = 0;
    const next = () => ++seq;
    for (const frac of [0, 0.25, 0.5, 0.75, 0.99]) {
      for (const cls of [undefined, 'moon-svg sm']) expect(moonSvg(frac, cls, next)).toBe(L.moonSvg(frac, cls));
    }
  });
});
