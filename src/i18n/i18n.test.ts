import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { useApp } from '../app/store';
import { en } from './en';
import { stripGlyph, translate, useT } from './useT';
import { vi as viDict, type I18nKey } from './vi';

const legacyHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');
const legacyDoc = new DOMParser().parseFromString(legacyHtml, 'text/html');
const { fns: L, ctx } = loadLegacyWithContext<{ t(k: string, fb: string): string }>(['I18N', 't'], { lang: 'vi' });

beforeEach(() => useApp.setState({ lang: 'vi' }));

describe('dictionaries', () => {
  it('every EN key exists in VI', () => {
    expect(Object.keys(en).filter(k => !(k in viDict))).toEqual([]);
  });
  it('VI text is the legacy HTML text', () => {
    expect(viDict['nav.home']).toBe(legacyDoc.getElementById('goHome')!.textContent);
    expect(viDict['landing.askPh']).toBe(legacyDoc.getElementById('askInput')!.getAttribute('placeholder'));
  });
  it('translate() matches the legacy t(key, fallback) in both languages for every key', () => {
    for (const lang of ['vi', 'en'] as const) {
      ctx.lang = lang;
      for (const k of Object.keys(viDict) as I18nKey[]) expect(translate(lang, k), `${lang} ${k}`).toBe(L.t(k, viDict[k]));
    }
  });
});

describe('useT', () => {
  it('follows the store language', () => {
    const { result } = renderHook(() => useT());
    expect(result.current.t('nav.home')).toBe(viDict['nav.home']);
    expect(result.current.pick({ vi: 'Xin chào', en: 'Hello' })).toBe('Xin chào');
    act(() => useApp.setState({ lang: 'en' }));
    expect(result.current.lang).toBe('en');
    expect(result.current.t('nav.home')).toBe('☉︎ Home');
    expect(result.current.pick({ vi: 'Xin chào', en: 'Hello' })).toBe('Hello');
  });
});

describe('stripGlyph (legacy setLabel)', () => {
  it('drops leading symbols/emoji before an icon label, keeps quotes and digits', () => {
    expect(stripGlyph('☉︎ Home')).toBe('Home');
    expect(stripGlyph('✦︎ AI Reading')).toBe('AI Reading');
    expect(stripGlyph('"Quote"')).toBe('"Quote"');
    expect(stripGlyph('3 lá')).toBe('3 lá');
    expect(stripGlyph('')).toBe('');
  });
});
