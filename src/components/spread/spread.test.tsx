import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLegacyWithContext } from '../../../tests/legacy/harness';
import { deckCards } from '../../../tests/fixtures/deck';
import { initialState, useApp } from '../../app/store';
import { SPREADS, SPREAD_LAYOUT } from '../../core/spreads';
import type { SpreadCard } from '../../core/types';
import { SpreadBoard, type SpreadBoardHandle } from './SpreadBoard';
import { SpreadPicker } from './SpreadPicker';

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState() });
});
afterEach(() => vi.useRealTimers());

/** Chuẩn hoá style (React viết "a: b;", HTML cũ viết "a:b;") như test Daily. */
const norm = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll<HTMLElement>('[style]').forEach(el => el.setAttribute('style', el.style.cssText));
  return d.innerHTML;
};

const mkCards = (n: number): SpreadCard[] =>
  deckCards.slice(0, n).map((c, i) => ({ ...c, orientation: i % 2 ? 'nguoc' : 'xuoi' }) as SpreadCard);

const LEGACY_NAMES = ['escapeHtml', 'CARD_H', 'ROW3', 'SPREAD_UI', 'freeLayout', 'layoutGeom', 'SPREAD_LAYOUT', 'SPREADS', 'spreadArt',
  'renderSpreadPicker', 'renderBoard'];

/** Chạy hàm render của bản cũ trên phần tử giả, trả về innerHTML. */
function legacyRun(g: Record<string, unknown>) {
  const els: Record<string, Record<string, unknown>> = {};
  const vars = new Map<string, string>();
  const { fns, ctx } = loadLegacyWithContext<{ renderSpreadPicker(): void; renderBoard(m: string): void }>(LEGACY_NAMES, {
    ...g,
    syncPickerNav() {},
  });
  ctx.syncPickerNav = () => {};
  ctx.$ = (id: string) =>
    (els[id] ??= {
      innerHTML: '', hidden: false, attrs: {} as Record<string, string>, offsetLeft: 0,
      setAttribute() {}, querySelectorAll: () => [], querySelector: () => null,
      style: { setProperty: (k: string, v: string) => vars.set(k, v) },
    });
  return { fns, els, vars };
}

describe('SpreadPicker', () => {
  for (const lang of ['vi', 'en'] as const) {
    it(`matches legacy renderSpreadPicker markup (${lang})`, () => {
      const { fns, els } = legacyRun({ lang, spreadKey: 'celtic' });
      fns.renderSpreadPicker();
      useApp.setState({ lang });
      render(<SpreadPicker value="celtic" onChange={() => {}} />);
      const box = document.getElementById('spreadPicker')!;
      expect(norm(box.innerHTML)).toBe(norm(els.spreadPicker!.innerHTML as string));
      expect(box.getAttribute('aria-label')).toBe(lang === 'en' ? 'Spread type' : 'Kiểu trải bài');
      expect(box.getAttribute('role')).toBe('radiogroup');
      expect(document.querySelectorAll('.sp-tile')).toHaveLength(SPREADS.length);
    });
  }

  it('renders the picker-wrap with legacy nav buttons and a custom id', () => {
    const { container } = render(<SpreadPicker value="ppf" onChange={() => {}} id="drawSpreadPicker" />);
    expect(container.querySelector('.picker-wrap #drawSpreadPicker.spread-picker')).not.toBeNull();
    expect(container.querySelector('.picker-nav.prev')!.getAttribute('aria-label')).toBe('Kiểu trải trước');
    expect(container.querySelector('.picker-nav.next')!.getAttribute('aria-label')).toBe('Kiểu trải tiếp');
  });

  it('clicking another tile calls onChange; the selected tile does nothing', () => {
    const onChange = vi.fn();
    render(<SpreadPicker value="celtic" onChange={onChange} />);
    fireEvent.click(document.querySelector('[data-k="celtic"]')!);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-k="ppf"]')!);
    expect(onChange).toHaveBeenCalledWith('ppf');
  });

  it('the ‹ / › buttons scroll by 80% of the box width', () => {
    render(<SpreadPicker value="ppf" onChange={() => {}} />);
    const box = document.getElementById('spreadPicker')! as HTMLElement & { scrollBy: ReturnType<typeof vi.fn> };
    box.scrollBy = vi.fn();
    Object.defineProperty(box, 'clientWidth', { value: 500, configurable: true });
    fireEvent.click(document.querySelector('.picker-nav.prev')!);
    expect(box.scrollBy).toHaveBeenLastCalledWith({ left: -400, behavior: 'smooth' });
    fireEvent.click(document.querySelector('.picker-nav.next')!);
    expect(box.scrollBy).toHaveBeenLastCalledWith({ left: 400, behavior: 'smooth' });
  });

  it('syncs the nav disabled state and more-left/more-right on scroll', () => {
    render(<SpreadPicker value="ppf" onChange={() => {}} />);
    const box = document.getElementById('spreadPicker')!;
    const wrap = box.parentElement!;
    Object.defineProperty(box, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(box, 'scrollWidth', { value: 1000, configurable: true });
    box.scrollLeft = 0;
    act(() => { box.dispatchEvent(new Event('scroll')); });
    expect((wrap.querySelector('.picker-nav.prev') as HTMLButtonElement).disabled).toBe(true);
    expect((wrap.querySelector('.picker-nav.next') as HTMLButtonElement).disabled).toBe(false);
    expect(wrap.classList.contains('more-right')).toBe(true);
    expect(wrap.classList.contains('more-left')).toBe(false);
    box.scrollLeft = 700;
    act(() => { box.dispatchEvent(new Event('scroll')); });
    expect((wrap.querySelector('.picker-nav.next') as HTMLButtonElement).disabled).toBe(true);
    expect(wrap.classList.contains('more-left')).toBe(true);
  });
});

describe('SpreadBoard', () => {
  const POS = ['Quá khứ', 'Hiện tại', 'Tương lai'];

  function legacyBoard(key: string, cards: SpreadCard[], positions: string[] | null, mode: string, lang = 'vi') {
    const { fns, els, vars } = legacyRun({ lang, spreadKey: key, spread: cards, spreadPositions: positions });
    fns.renderBoard(mode);
    return { html: els.spreadBoard!.innerHTML as string, hidden: els.spreadBoard!.hidden as boolean, vars };
  }

  it('matches legacy renderBoard for a 3-card ppf spread (shown)', () => {
    const cards = mkCards(3);
    const lg = legacyBoard('ppf', cards, POS, '');
    render(<SpreadBoard spreadKey="ppf" cards={cards} positions={POS} mode="shown" />);
    const board = document.getElementById('spreadBoard')!;
    expect(norm(board.innerHTML)).toBe(norm(lg.html));
    expect(board.hidden).toBe(false);
    expect(board.style.getPropertyValue('--ar')).toBe(lg.vars.get('--ar'));
    expect(board.style.getPropertyValue('--bw')).toBe(lg.vars.get('--bw'));
  });

  it('matches legacy for a 7-card free spread in deal mode (cards .await)', () => {
    const cards = mkCards(7);
    const lg = legacyBoard('free', cards, null, 'deal');
    render(<SpreadBoard spreadKey="free" cards={cards} positions={null} mode="deal" />);
    const board = document.getElementById('spreadBoard')!;
    expect(norm(board.innerHTML)).toBe(norm(lg.html));
    expect(board.querySelectorAll('.board-card.await')).toHaveLength(7);
  });

  it('English reversed title', () => {
    const cards = mkCards(2);
    const lg = legacyBoard('free', cards, null, '', 'en');
    useApp.setState({ lang: 'en' });
    render(<SpreadBoard spreadKey="free" cards={cards} positions={null} mode="shown" />);
    expect(norm(document.getElementById('spreadBoard')!.innerHTML)).toBe(norm(lg.html));
  });

  it('is hidden and empty when there are no cards in a free spread', () => {
    const lg = legacyBoard('free', [], null, '');
    expect(lg.hidden).toBe(true);
    render(<SpreadBoard spreadKey="free" cards={[]} positions={null} mode="shown" />);
    const board = document.getElementById('spreadBoard')!;
    expect(board.hidden).toBe(true);
    expect(board.innerHTML).toBe('');
  });

  it('a revealed card with an image opens the lightbox; reversed flips; an unrevealed card reveals first', () => {
    const cards = mkCards(2);
    render(<SpreadBoard spreadKey="free" cards={cards} positions={null} mode="deal" />);
    const els = document.querySelectorAll<HTMLElement>('.board-card');
    fireEvent.click(els[0]!);
    expect(els[0]!.classList.contains('revealed')).toBe(true);
    expect(useApp.getState().lightbox).toBeNull();
    fireEvent.click(els[0]!);
    expect(useApp.getState().lightbox).toEqual({ url: cards[0]!.image_url, reversed: false });
    fireEvent.click(els[1]!);
    fireEvent.click(els[1]!);
    expect(useApp.getState().lightbox).toEqual({ url: cards[1]!.image_url, reversed: true });
  });

  it('re-rendering with the same cards does not overwrite classes owned by the engine', () => {
    const cards = mkCards(3);
    const { rerender } = render(<SpreadBoard spreadKey="ppf" cards={cards} positions={POS} mode="deal" />);
    const el = document.querySelector<HTMLElement>('.board-card')!;
    el.classList.remove('await');
    el.classList.add('revealed');
    rerender(<SpreadBoard spreadKey="ppf" cards={cards} positions={['a', 'b', 'c']} mode="deal" />);
    expect(document.querySelector('.board-card')).toBe(el);
    expect(el.classList.contains('revealed')).toBe(true);
    expect(el.classList.contains('await')).toBe(false);
    // bộ lá mới: gắn lại, lại ở trạng thái .await
    rerender(<SpreadBoard spreadKey="ppf" cards={mkCards(3)} positions={POS} mode="deal" />);
    expect(document.querySelectorAll('.board-card.await')).toHaveLength(3);
  });

  it('deal() resolves after the last card is revealed; unmount mid-deal leaves no timers', async () => {
    vi.useFakeTimers();
    const ref = createRef<SpreadBoardHandle>();
    const cards = mkCards(3);
    const { unmount } = render(<SpreadBoard ref={ref} spreadKey="ppf" cards={cards} positions={POS} mode="deal" />);
    // jsdom không có Element.animate: engine rơi về nhánh lật ngay
    let done = false;
    const p = ref.current!.deal().then(() => { done = true; });
    await act(async () => { await vi.runAllTimersAsync(); await p; });
    expect(done).toBe(true);
    expect(document.querySelectorAll('.board-card.revealed')).toHaveLength(3);
    unmount();

    // có animate giả: giữa chừng thì gỡ, không còn hẹn giờ
    const anim = vi.fn(() => ({ cancel: vi.fn() }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = anim;
    try {
      const ref2 = createRef<SpreadBoardHandle>();
      const r2 = render(<SpreadBoard ref={ref2} spreadKey="ppf" cards={cards} positions={POS} mode="deal" />);
      void ref2.current!.deal();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      r2.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    }
  });

  it('SPREAD_LAYOUT keys all have a board', () => {
    for (const k of Object.keys(SPREAD_LAYOUT)) {
      const { unmount } = render(<SpreadBoard spreadKey={k} cards={[]} positions={null} mode="shown" />);
      expect(document.getElementById('spreadBoard')!.hidden).toBe(false);
      unmount();
    }
  });
});
