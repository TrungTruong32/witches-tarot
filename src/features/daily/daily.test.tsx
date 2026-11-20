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
  // Thuộc tính tải ảnh là tối ưu hiệu năng (bản cũ dùng loading=lazy), không thuộc phần hiển thị cần khớp
  for (const a of IMG_PERF_ATTRS) d.querySelectorAll('img').forEach(el => el.removeAttribute(a));
  return d.innerHTML;
};
const IMG_PERF_ATTRS = ['loading', 'width', 'height', 'decoding', 'fetchpriority'];

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

  it('ảnh lá hôm nay (phần tử LCP): tải ngay, ưu tiên cao, giữ chỗ bằng width/height', () => {
    render(<Daily />);
    const img = document.querySelector('#dailyCard img.card-image')!;
    expect(img.hasAttribute('loading')).toBe(false);
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('decoding')).toBe('async');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['307', '512']);
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

describe('Daily midnight timer is robust', () => {
  it('a timer that fires early (clock moved back) reschedules instead of stopping', () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59, 58));
    const { unmount } = render(<Daily />);
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59, 40)); // đồng hồ bị chỉnh lùi 18 giây
    act(() => { vi.advanceTimersByTime(2100); }); // hẹn giờ cũ chạy khi vẫn là ngày 5
    expect(document.getElementById('dailyDate')!.textContent).toBe('(2026-1-5 · Witches Tarot)');
    act(() => { vi.advanceTimersByTime(20000); });
    expect(document.getElementById('dailyDate')!.textContent).toBe('(2026-1-6 · Witches Tarot)');
    unmount();
  });

  it('coming back to the tab after sleeping past midnight shows the new day', () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 5, 22, 0));
    const { unmount } = render(<Daily />);
    vi.setSystemTime(new Date(2026, 0, 6, 7, 0));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(document.getElementById('dailyDate')!.textContent).toBe('(2026-1-6 · Witches Tarot)');
    unmount();
  });
});

describe('Daily trước khi tarot.db nạp xong', () => {
  it('chưa có lá thì chưa hiện ô nhật ký (lá hiện sau sẽ đẩy nó xuống); DB về → lá + ô nhật ký cùng lúc', () => {
    useApp.setState({ ...initialState() }); // db null, deck null, dbStatus 'loading'
    render(<Daily />);
    expect(document.querySelector('#dailyCard img')).toBeNull();
    expect(document.getElementById('dailyNote')).toBeNull();
    act(() => useApp.setState({ db, decks: db.decks(), deck: 'Witches Tarot', dbStatus: 'ready' }));
    expect(document.querySelector('#dailyCard img')).not.toBeNull();
    expect(document.getElementById('dailyNote')).not.toBeNull();
  });

  it('DB lỗi → ô nhật ký vẫn hiện như cũ', () => {
    useApp.setState({ ...initialState(), dbStatus: 'error' });
    render(<Daily />);
    expect(document.getElementById('dailyNote')).not.toBeNull();
  });
});
