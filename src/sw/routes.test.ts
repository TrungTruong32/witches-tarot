import { describe, expect, it } from 'vitest';
import { APP_ROUTES, route } from './routes';

const at = (path: string) => new URL(path, 'https://tarot.example');

describe('route()', () => {
  it('mọi route của app (cả "/") khi điều hướng → network-first-app', () => {
    for (const p of ['/', '/hom-nay', '/tra-cuu', '/boc-bai', '/trai-bai', '/nhat-ky', '/yes-no', '/bau-troi'])
      expect(route(at(p), 'navigate')).toBe('network-first-app');
    expect(APP_ROUTES).toContain('/nhat-ky');
  });

  it('route app kèm query/hash hoặc dấu / cuối vẫn là app', () => {
    expect(route(at('/trai-bai#r=abc'), 'navigate')).toBe('network-first-app');
    expect(route(at('/tra-cuu?q=1'), 'navigate')).toBe('network-first-app');
    expect(route(at('/nhat-ky/'), 'navigate')).toBe('network-first-app');
    expect(route(at('/index.html'), 'navigate')).toBe('network-first-app');
  });

  it('điều hướng khác (/la-bai/…, đường lạ) → network-first-page', () => {
    expect(route(at('/la-bai/'), 'navigate')).toBe('network-first-page');
    expect(route(at('/la-bai/rider-waite/the-fool/'), 'navigate')).toBe('network-first-page');
    expect(route(at('/khong-co'), 'navigate')).toBe('network-first-page');
  });

  it('/api/* luôn bypass, kể cả khi là điều hướng', () => {
    expect(route(at('/api/ai'), 'cors')).toBe('bypass');
    expect(route(at('/api/img?x=1'), 'navigate')).toBe('bypass');
  });

  it('tài nguyên còn lại → cache-first', () => {
    for (const p of ['/assets/index-abc.js', '/assets/sql-wasm-x.wasm', '/tarot.db', '/card_en.json', '/sky.json', '/icon-192.png', '/la-bai/style.css'])
      expect(route(at(p), 'same-origin')).toBe('cache-first');
    expect(route(new URL('https://fonts.gstatic.com/x.woff2'), 'cors')).toBe('cache-first');
  });

  it('"/apix" không bị nhầm là /api/', () => {
    expect(route(at('/apix.png'), 'no-cors')).toBe('cache-first');
  });
});
