import { beforeEach, describe, expect, it } from 'vitest';
import { cardBackCss } from '../core/cardBacks';
import { initialState } from './store';
import { syncRootAttrs } from './rootAttrs';

const html = document.documentElement;
beforeEach(() => {
  localStorage.clear();
  for (const a of ['data-theme', 'data-fx', 'data-sky', 'data-skycity', 'lang']) html.removeAttribute(a);
  delete document.body.dataset.mode;
});

describe('syncRootAttrs', () => {
  it('applies theme/fx/sky/lang/card back/mode like the legacy init code', () => {
    const s = initialState();
    s.prefs = { ...s.prefs, theme: 'rose', fx: 'off', skyMode: 'real', skyCity: 'hcm', cardBack: 'eye' };
    s.lang = 'en';
    syncRootAttrs(s, 'browse');
    expect(html.getAttribute('data-theme')).toBe('rose');
    expect(html.dataset.fx).toBe('off');
    expect(html.dataset.sky).toBe('real');
    expect(html.dataset.skycity).toBe('hcm');
    expect(html.getAttribute('lang')).toBe('en');
    expect(html.style.getPropertyValue('--cardback')).toBe(cardBackCss('eye'));
    expect(document.body.dataset.mode).toBe('browse');
  });
  it('removes data-theme for the default theme and data-mode when no mode', () => {
    const s = initialState();
    html.setAttribute('data-theme', 'night');
    document.body.dataset.mode = 'daily';
    syncRootAttrs(s, null);
    expect(html.hasAttribute('data-theme')).toBe(false);
    expect(document.body.dataset.mode).toBeUndefined();
  });
});
