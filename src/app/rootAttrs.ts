// Đồng bộ thuộc tính gốc mà CSS cũ (và các engine nền) đọc: html[data-theme|data-fx|data-sky|data-skycity|lang],
// biến --cardback, body[data-mode].
import { cardBackCss } from '../core/cardBacks';
import type { AppState } from './store';

export function syncRootAttrs(s: Pick<AppState, 'prefs' | 'lang'>, mode: string | null): void {
  const html = document.documentElement;
  const { theme, fx, skyMode, skyCity, cardBack } = s.prefs;
  if (theme) html.setAttribute('data-theme', theme);
  else html.removeAttribute('data-theme');
  html.dataset.fx = fx;
  html.dataset.sky = skyMode;
  html.dataset.skycity = skyCity;
  html.setAttribute('lang', s.lang);
  html.style.setProperty('--cardback', cardBackCss(cardBack));
  if (mode) document.body.dataset.mode = mode;
  else delete document.body.dataset.mode;
}
