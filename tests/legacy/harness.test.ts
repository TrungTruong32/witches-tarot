import { describe, expect, it } from 'vitest';
import { loadLegacy } from './harness';

describe('legacy harness', () => {
  it('extracts named functions from the frozen legacy script', () => {
    const L = loadLegacy<{
      romanToInt(s: string): number | null;
      dignity(a: string | null, b: string | null): string | null;
    }>(['romanToInt', 'dignity']);
    expect(L.romanToInt('XIV')).toBe(14);
    expect(L.romanToInt('7')).toBe(7);
    expect(L.romanToInt('abc')).toBeNull();
    expect(L.dignity('fire', 'air')).toBe('support');
  });

  it('extracts const declarations too', () => {
    const L = loadLegacy<{ NUMEROLOGY_EN: Record<string, string> }>(['NUMEROLOGY_EN']);
    expect(L.NUMEROLOGY_EN['3']).toBe('Creativity, growth, cooperation');
  });

  it('exposes injected globals to legacy code', () => {
    const L = loadLegacy<{ t(key: string, fb: string): string }>(['I18N', 't'], { lang: 'en' });
    expect(L.t('nav.home', 'x')).toBe('☉︎ Home');
  });

  it('throws on unknown names', () => {
    expect(() => loadLegacy(['noSuchFunction'])).toThrow(/noSuchFunction/);
  });
});
