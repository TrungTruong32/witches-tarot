import { act, fireEvent, render } from '@testing-library/react';
import type { Database } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLegacyWithContext } from '../../../tests/legacy/harness';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { initialState, useApp } from '../../app/store';
import { pickDailyCard } from '../../core/daily';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { Daily } from './Daily';

let db: CardsDb;
let legacyDb: Database;
beforeAll(async () => {
  const bytes = await makeDb(deckCards);
  db = openCardsDb(bytes, await sqlJs());
  legacyDb = new (await sqlJs()).Database(bytes);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 5, 9, 0));
  localStorage.clear();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: 'Witches Tarot', dbStatus: 'ready' });
});
afterEach(() => vi.useRealTimers());

/** Chuẩn hoá để so sánh: thuộc tính style được ghi lại theo cách trình duyệt tuần tự hoá (React viết "a: b;", HTML cũ viết "a:b;"). */
const norm = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll<HTMLElement>('[style]').forEach(el => el.setAttribute('style', el.style.cssText));
  return d.innerHTML;
};

describe('Daily', () => {
  it("shows the day's card exactly like legacy renderDaily", () => {
    const { fns, ctx } = loadLegacyWithContext<{ renderDaily(): void }>(
      ['escapeHtml', 'ELEMENTS', 'NUMEROLOGY_EN', 'NUMEROLOGY', 'elementOfSuit', 'ASTRO_GLYPHS', 'astroGlyph', 'corrChips', 'I18N', 't',
        'cardText', 'SEARCH_COLS', 'queryCards', 'dailyKey', 'hashStr', 'renderDaily'],
      { lang: 'vi', CARD_EN: null, db: legacyDb, selectedDeck: 'Witches Tarot', Date, localStorage },
    );
    const box: Record<string, { innerHTML: string; textContent: string; value: string }> = {};
    ctx.$ = (id: string) => (box[id] ??= { innerHTML: '', textContent: '', value: '' });
    fns.renderDaily();
    render(<Daily />);
    const expected = pickDailyCard(db.query({ deck: 'Witches Tarot' }), 'Witches Tarot');
    expect(document.querySelector('#dailyCard .draw-name')!.textContent).toContain(expected!.ten);
    expect(norm(document.getElementById('dailyCard')!.innerHTML)).toBe(norm(box.dailyCard!.innerHTML));
    expect(document.getElementById('dailyDate')!.textContent).toBe(box.dailyDate!.textContent);
    expect(document.getElementById('dailyDate')!.textContent).toBe('(2026-1-5 · Witches Tarot)');
  });

  it('saves the journal note under dailyNote:<Y-M-D> and shows it again on remount', () => {
    const { unmount } = render(<Daily />);
    fireEvent.change(document.getElementById('dailyNote')!, { target: { value: 'Hôm nay vui' } });
    expect(localStorage.getItem('dailyNote:2026-1-5')).toBe('Hôm nay vui');
    unmount();
    render(<Daily />);
    expect((document.getElementById('dailyNote') as HTMLTextAreaElement).value).toBe('Hôm nay vui');
  });

  it('changing the deck re-renders the card', () => {
    render(<Daily />);
    act(() => useApp.getState().setDeck('Rider-Waite'));
    const expected = pickDailyCard(db.query({ deck: 'Rider-Waite' }), 'Rider-Waite');
    expect(document.querySelector('#dailyCard .draw-name')!.textContent).toContain(expected!.ten);
    expect(document.getElementById('dailyDate')!.textContent).toBe('(2026-1-5 · Rider-Waite)');
  });

  it('English labels', () => {
    render(<Daily />);
    act(() => useApp.setState({ lang: 'en' }));
    expect(document.querySelector('#dailyView h3, h3')!.textContent).toContain('Card of the day');
    expect(document.querySelector('#dailyCard .orient-badge')!.textContent).toBe('Upright');
  });
});

describe('Daily across midnight', () => {
  it('rolls over to the new day: date, card and journal note all switch together', () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59, 58));
    localStorage.setItem('dailyNote:2026-1-6', 'tomorrow note');
    const { unmount } = render(<Daily />);
    fireEvent.change(document.getElementById('dailyNote')!, { target: { value: 'today note' } });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(document.getElementById('dailyDate')!.textContent).toBe('(2026-1-6 · Witches Tarot)');
    const expected = pickDailyCard(db.query({ deck: 'Witches Tarot' }), 'Witches Tarot', new Date(2026, 0, 6))!;
    expect(document.querySelector('#dailyCard .draw-name')!.textContent).toContain(expected.ten);
    expect((document.getElementById('dailyNote') as HTMLTextAreaElement).value).toBe('tomorrow note');
    expect(localStorage.getItem('dailyNote:2026-1-5')).toBe('today note');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
