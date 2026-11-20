import { act, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Database } from 'sql.js';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../../tests/legacy/harness';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { initialState, useApp } from '../../app/store';
import type { Card } from '../../core/types';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { Browse } from './Browse';

let db: CardsDb;
let legacyDb: Database;
beforeAll(async () => {
  const bytes = await makeDb(deckCards);
  db = openCardsDb(bytes, await sqlJs());
  legacyDb = new (await sqlJs()).Database(bytes);
});
beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: 'Witches Tarot', dbStatus: 'ready' });
});

const renderBrowse = () => render(<MemoryRouter><Browse /></MemoryRouter>);
const listNames = () => [...document.querySelectorAll('#cardsList .card-item strong')].map(e => e.textContent);
const search = () => document.getElementById('searchInput') as HTMLInputElement;

/** Thứ tự danh sách mà updateFilter() của bản cũ sẽ vẽ. */
function legacyList(deck: string, category: string, q: string): string[] {
  let out: Card[] = [];
  const { fns } = loadLegacyWithContext<{ updateFilter(): void }>(
    ['SEARCH_COLS', 'queryCards', 'fold', 'ROMAN', 'SUIT_ALIAS', 'COURT_ALIAS', 'RANK_WORDS', 'MAJOR_ALIAS', 'STOP',
      'searchIndex', 'buildSearchIndex', 'parseCardQuery', 'scoreCard', 'searchCards', 'updateFilter'],
    { db: legacyDb, selectedDeck: deck, selectedCategory: category, searchInput: { value: q }, renderList: (rows: Card[]) => { out = rows; } },
  );
  fns.updateFilter();
  return out.map(c => `${c.so} - ${c.ten}`);
}

describe('Browse', () => {
  it('list for a smart search matches legacy updateFilter (smart matches first, then text matches)', async () => {
    renderBrowse();
    for (const q of ['vua kiếm', 'of cups', 'xv', 'sụp đổ']) {
      fireEvent.change(search(), { target: { value: q } });
      expect(listNames(), q).toEqual(legacyList('Witches Tarot', 'all', q));
    }
  });

  it('first card is auto-selected and its details shown', () => {
    renderBrowse();
    expect(document.querySelector('#cardsList .card-item')!.classList.contains('active')).toBe(true);
    expect(document.querySelector('#cardDetails h2')!.textContent).toBe('The Fool');
    expect(document.querySelector('#cardDetails .card-image')!.getAttribute('src')).toBe(deckCards[0]!.image_url);
  });

  it('clicking a suit tile filters the list and sets aria-pressed; clear empties search and focuses it', async () => {
    renderBrowse();
    const tiles = [...document.querySelectorAll('#categoryTabs .suit-tile')];
    expect(tiles.map(t => t.querySelector('.st-name')!.textContent)).toEqual(['Tất cả', 'Ẩn Chính', 'Cốc', 'Kiếm', 'Gậy', 'Tiền']);
    expect(tiles[0]!.querySelector('.st-meta')!.textContent).toBe('✧ 14 lá');
    expect(tiles[2]!.querySelector('.st-meta')!.textContent).toBe('🜄 Nước · 3 lá');
    await userEvent.click(tiles[2]!);
    expect(tiles[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(tiles[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(listNames()).toEqual(legacyList('Witches Tarot', 'Bo Cups', ''));
    fireEvent.change(search(), { target: { value: 'two' } });
    await userEvent.click(document.getElementById('clearButton')!);
    expect(search().value).toBe('');
    expect(document.activeElement).toBe(search());
  });

  it('side images of a suit tile load lazily on hover', async () => {
    renderBrowse();
    const cups = document.querySelectorAll('#categoryTabs .suit-tile')[2]!;
    expect(cups.querySelector('img[data-k="0"]')!.getAttribute('src')).toBeTruthy();
    expect(cups.querySelector('img[data-k="1"]')!.getAttribute('src')).toBeNull();
    fireEvent.mouseEnter(cups);
    expect(cups.querySelector('img[data-k="1"]')!.getAttribute('src')).toBeTruthy();
  });

  it('no results → #noResults and the empty detail', () => {
    renderBrowse();
    fireEvent.change(search(), { target: { value: 'zzzzqq' } });
    expect(document.getElementById('noResults')!.style.display).toBe('block');
    expect(document.querySelector('#cardDetails h3')!.textContent).toBe('Chưa chọn lá bài');
  });

  it('English: EN meanings for Witches cards, VI-only sections hidden, suit tiles relabelled', () => {
    const fool = deckCards[0]!;
    useApp.setState({ cardEn: { [fool.id]: { kw: 'new beginnings', up: 'EN upright', rev: 'EN reversed' } } });
    renderBrowse();
    expect(document.querySelector('#cardDetails')!.textContent).toContain('Mô tả hình ảnh');
    act(() => useApp.setState({ lang: 'en' }));
    const d = document.querySelector('#cardDetails')!;
    expect(d.textContent).toContain('EN upright');
    expect(d.textContent).toContain('Keywords');
    expect(d.textContent).not.toContain('Mô tả hình ảnh');
    expect(document.querySelector('#categoryTabs .suit-tile .st-name')!.textContent).toBe('All');
    expect(search().placeholder).toBe('Search by number, name, keyword, meaning...');
  });

  it('pages link points at the selected deck', () => {
    renderBrowse();
    expect(document.getElementById('browsePagesLink')!.getAttribute('href')).toBe('/la-bai/witches-tarot/');
    act(() => useApp.getState().setDeck('Rider-Waite'));
    expect(document.getElementById('browsePagesLink')!.getAttribute('href')).toBe('/la-bai/rider-waite/');
  });

  it('changing the deck resets the suit filter and the search', async () => {
    renderBrowse();
    await userEvent.click(document.querySelectorAll('#categoryTabs .suit-tile')[2]!);
    fireEvent.change(search(), { target: { value: 'ace' } });
    act(() => useApp.getState().setDeck('Rider-Waite'));
    expect(search().value).toBe('');
    expect(document.querySelector('#categoryTabs .suit-tile')!.getAttribute('aria-pressed')).toBe('true');
    expect(listNames()).toEqual(legacyList('Rider-Waite', 'all', ''));
  });

  it('key sections stay open; long/secondary sections sit in closed <details> and close again on another card', async () => {
    renderBrowse();
    const d = () => document.querySelector('#cardDetails')!;
    const openTitles = () => [...d().querySelectorAll(':scope > div.section > h3')].map(h => h.textContent);
    expect(openTitles()).toEqual(['Từ khóa', 'Ý nghĩa xuôi', 'Ý nghĩa ngược']);
    const more = () => [...d().querySelectorAll<HTMLDetailsElement>(':scope > details.section-more')];
    expect(more().length).toBeGreaterThan(0);
    expect(more().every(x => !x.open)).toBe(true);
    // Không mất nội dung: chữ của phần gập vẫn nằm trong DOM
    const fool = deckCards[0]!;
    expect(more().map(x => x.querySelector('summary h3')!.textContent)).toContain('Mô tả hình ảnh');
    expect(d().textContent).toContain(fool.mo_ta_hinh_anh!);
    more()[0]!.open = true;
    await userEvent.click(document.querySelectorAll<HTMLElement>('#cardsList .card-item')[1]!);
    expect(more().every(x => !x.open)).toBe(true);
  });

  it('card details link to the SEO page and the source', () => {
    renderBrowse();
    const links = [...document.querySelectorAll('#cardDetails a')].map(a => a.getAttribute('href'));
    expect(links).toContain('/la-bai/witches-tarot/the-fool/');
  });
});

describe('Browse keeps its place across screens (legacy only hid the view)', () => {
  it('suit filter, search text and the picked card survive leaving and coming back', async () => {
    const first = renderBrowse();
    await userEvent.click(document.querySelectorAll('#categoryTabs .suit-tile')[2]!);
    fireEvent.change(search(), { target: { value: 'o' } });
    const items = [...document.querySelectorAll<HTMLElement>('#cardsList .card-item')];
    expect(items.length).toBeGreaterThan(1);
    await userEvent.click(items[1]!);
    const pickedName = document.querySelector('#cardsList .card-item.active strong')!.textContent;
    first.unmount();
    renderBrowse();
    expect(document.querySelectorAll('#categoryTabs .suit-tile')[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(search().value).toBe('o');
    expect(document.querySelector('#cardsList .card-item.active strong')!.textContent).toBe(pickedName);
  });
});

describe('Browse resets on any deck change, even while not shown (legacy setDeck)', () => {
  it('deck A → B → A elsewhere still clears the filter and search', async () => {
    const first = renderBrowse();
    await userEvent.click(document.querySelectorAll('#categoryTabs .suit-tile')[2]!);
    fireEvent.change(search(), { target: { value: 'o' } });
    first.unmount();
    act(() => { useApp.getState().setDeck('Rider-Waite'); useApp.getState().setDeck('Witches Tarot'); });
    renderBrowse();
    expect(document.querySelectorAll('#categoryTabs .suit-tile')[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(search().value).toBe('');
  });
});

describe('Tra cứu vẽ trước khi tarot.db nạp xong (LCP / không xô trang)', () => {
  // DB giả đúng cấu trúc tarot.db: 2 bộ × (22 Ẩn Chính + 4 chất × 14), thứ tự id như dữ liệu thật
  let full: CardsDb;
  beforeAll(async () => {
    const cards: Card[] = [];
    let id = 0;
    for (const deck of ['Witches Tarot', 'Rider-Waite']) {
      for (const [bo, n] of [['Bo An Chinh', 22], ['Bo Wands', 14], ['Bo Cups', 14], ['Bo Swords', 14], ['Bo Pentacles', 14]] as const) {
        for (let i = 0; i < n; i++) cards.push({ id: id++, deck, bo, so: String(i), ten: `${bo} ${i}`, image_url: `https://x.test/${id}.jpg` } as Card);
      }
    }
    full = openCardsDb(await makeDb(cards), await sqlJs());
  });
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#categoryTabs .suit-tile')];
  const metas = () => tiles().map(t => t.querySelector('.st-meta')!.textContent);

  it('DB đang nạp: đủ 6 ô chất bài (mặt lưng, đúng số lá) + ô chọn bộ; DB về thì giữ nguyên các ô, chỉ thêm ảnh', () => {
    localStorage.setItem('witchesTarotDeck', 'Rider-Waite');
    useApp.setState({ ...initialState() }); // db null, deck null, dbStatus 'loading'
    renderBrowse();
    expect(tiles()).toHaveLength(6);
    expect(metas()).toEqual(['✧ 78 lá', '✦ 22 lá', '🜂 Lửa · 14 lá', '🜄 Nước · 14 lá', '🜁 Khí · 14 lá', '🜃 Đất · 14 lá']);
    expect(document.querySelectorAll('#categoryTabs img')).toHaveLength(0);
    const sel = document.getElementById('deckSelectBrowse') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toEqual(['Witches Tarot', 'Rider-Waite']);
    expect(sel.value).toBe('Rider-Waite'); // bộ đã lưu = bộ boot() sẽ chọn
    expect(document.getElementById('noResults')!.style.display).toBe('none'); // chưa có DB thì không báo "không tìm thấy"
    const before = tiles();
    act(() => useApp.setState({ db: full, decks: full.decks(), deck: 'Rider-Waite', dbStatus: 'ready' }));
    expect(tiles()).toEqual(before); // cùng phần tử DOM → không dựng lại, không đổi độ lệch ngẫu nhiên
    expect(metas()).toEqual(['✧ 78 lá', '✦ 22 lá', '🜂 Lửa · 14 lá', '🜄 Nước · 14 lá', '🜁 Khí · 14 lá', '🜃 Đất · 14 lá']);
    expect(document.querySelectorAll('#categoryTabs img').length).toBeGreaterThan(0);
  });

  it('bấm ô chất bài trước khi DB về → vẫn giữ bộ lọc khi DB về', async () => {
    useApp.setState({ ...initialState() });
    renderBrowse();
    await userEvent.click(tiles()[2]!);
    act(() => useApp.setState({ db: full, decks: full.decks(), deck: 'Witches Tarot', dbStatus: 'ready' }));
    expect(tiles()[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(listNames().length).toBeGreaterThan(0);
  });

  it('DB lỗi → không đoán bộ, không vẽ ô (như cũ)', () => {
    useApp.setState({ ...initialState(), dbStatus: 'error' });
    renderBrowse();
    expect(tiles()).toHaveLength(0);
  });
});
