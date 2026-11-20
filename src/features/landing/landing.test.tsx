import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, useApp } from '../../app/store';
import { fanDrop, layoutFan } from './fan';
import { Landing } from './Landing';

const legacyHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');

function Probe() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + '|' + JSON.stringify(loc.state ?? null)}</output>;
}
const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
const where = () => screen.queryByTestId('where')?.textContent;
const input = () => document.getElementById('askInput') as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), dbStatus: 'ready' });
});
afterEach(() => vi.useRealTimers());

describe('layoutFan (legacy layoutLandingFan maths)', () => {
  it('phone and desktop widths', () => {
    const phone = layoutFan(320);
    expect([phone.cw, phone.R, phone.cards.length]).toEqual([54, 420, 15]);
    const desk = layoutFan(1440);
    expect([desk.cw, desk.R, desk.cards.length]).toEqual([104, 1368, 29]);
    expect(desk.cards[0]).toEqual({ a: '-28.14', dl: '0.00' });
    expect(desk.cards[28]).toEqual({ a: '28.14', dl: '-10.36' });
    expect(layoutFan(4000).cards.length).toBeLessThanOrEqual(41);
  });
});

describe('Landing fan drop', () => {
  it('is recomputed when only the viewport height changes (mobile URL bar, split screen)', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { bottom: this.id === 'askSkip' ? 700 : 0, height: this.id === 'askSkip' ? 20 : 0 } as DOMRect;
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    renderLanding();
    const fanEl = () => document.getElementById('landingFan')!;
    const cw = layoutFan(window.innerWidth).cw;
    expect(fanEl().style.getPropertyValue('--drop')).toBe(fanDrop(cw, 844, 700).toFixed(0) + 'px');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 });
    act(() => { window.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(200); });
    expect(fanEl().style.getPropertyValue('--drop')).toBe(fanDrop(cw, 760, 700).toFixed(0) + 'px');
    expect(fanDrop(cw, 760, 700)).not.toBe(fanDrop(cw, 844, 700));
    vi.restoreAllMocks();
  });
});

describe('Landing', () => {
  it('renders the legacy SEO/FAQ block verbatim', () => {
    renderLanding();
    const legacy = new DOMParser().parseFromString(legacyHtml, 'text/html').querySelector('.lt-seo')!;
    expect(document.querySelector('.lt-seo')!.innerHTML).toBe(legacy.innerHTML);
  });

  it('an empty submit shows the error and shakes, and the error hides after 2600 ms', () => {
    vi.useFakeTimers();
    renderLanding();
    fireEvent.submit(document.getElementById('askForm')!);
    expect(document.getElementById('askErr')!.classList.contains('show')).toBe(true);
    expect(document.getElementById('askForm')!.classList.contains('shake')).toBe(true);
    act(() => vi.advanceTimersByTime(2600));
    expect(document.getElementById('askErr')!.classList.contains('show')).toBe(false);
  });

  it('typing updates the n/300 counter', () => {
    renderLanding();
    fireEvent.change(input(), { target: { value: 'Tình yêu?' } });
    const cnt = document.getElementById('askCount')!;
    expect(cnt.textContent).toBe('9/300');
    expect(cnt.classList.contains('show')).toBe(true);
  });

  it('submitting a question goes to the reading screen with autoPick', () => {
    renderLanding();
    fireEvent.change(input(), { target: { value: '  Công việc?  ' } });
    fireEvent.submit(document.getElementById('askForm')!);
    expect(where()).toBe('/trai-bai|{"question":"Công việc?","autoPick":true}');
  });

  it('skip goes to the reading screen with an empty question', () => {
    renderLanding();
    fireEvent.click(document.getElementById('askSkip')!);
    expect(where()).toBe('/trai-bai|{"question":"","autoPick":true}');
  });

  it('top nav buttons go to their screens', () => {
    renderLanding();
    fireEvent.click(document.querySelector('.lt-nav [data-go="browse"]')!);
    expect(where()).toBe('/tra-cuu|null');
  });

  it('the brand button carries the compass icon and a glyph-free label, like legacy initIcons', () => {
    renderLanding();
    const b = document.getElementById('landingEnter')!;
    expect(b.querySelector('svg.ico use')!.getAttribute('href')).toBe('#i-compass');
    expect(b.querySelector('.lbl')!.textContent).toBe('Witches Tarot');
  });

  it('the brand button enters on Today (the burger is covered in routes.test: needs the full app shell)', () => {
    renderLanding();
    fireEvent.click(document.getElementById('landingEnter')!);
    expect(where()).toBe('/hom-nay|null');
  });

  it('while the DB is loading the brand button waits with a spinner, then enters', () => {
    useApp.setState({ dbStatus: 'loading' });
    renderLanding();
    fireEvent.click(document.getElementById('landingEnter')!);
    const b = document.getElementById('landingEnter') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.querySelector('.spinner')).not.toBeNull();
    expect(where()).toBeUndefined();
    act(() => useApp.setState({ dbStatus: 'ready' }));
    expect(where()).toBe('/hom-nay|null');
  });

  it('when the DB failed, CTAs show the error instead of spinning forever', () => {
    useApp.setState({ dbStatus: 'error', dbError: 'Không thể tải cơ sở dữ liệu: HTTP 404 khi tải tarot.db' });
    renderLanding();
    fireEvent.click(document.getElementById('landingEnter')!);
    expect(where()).toBeUndefined();
    expect(document.getElementById('landingError')!.textContent).toBe('Không thể tải cơ sở dữ liệu: HTTP 404 khi tải tarot.db');
    expect((document.getElementById('landingEnter') as HTMLButtonElement).disabled).toBe(false);
  });

  it('rotates placeholder tips every 3800 ms, paused while focused or non-empty, in the current language', () => {
    vi.useFakeTimers();
    renderLanding();
    expect(input().placeholder).toBe('Mối quan hệ này sẽ đi về đâu?');
    act(() => vi.advanceTimersByTime(3800));
    expect(input().placeholder).toBe('Tôi nên tập trung vào điều gì lúc này?');
    fireEvent.change(input(), { target: { value: 'x' } });
    act(() => vi.advanceTimersByTime(3800));
    expect(input().placeholder).toBe('Tôi nên tập trung vào điều gì lúc này?');
    fireEvent.change(input(), { target: { value: '' } });
    act(() => input().focus());
    act(() => vi.advanceTimersByTime(3800));
    expect(input().placeholder).toBe('Tôi nên tập trung vào điều gì lúc này?');
    act(() => input().blur());
    act(() => useApp.setState({ lang: 'en' }));
    expect(input().placeholder).toBe('What should I focus on right now?');
  });

  it('leaves no timers behind after unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderLanding();
    fireEvent.submit(document.getElementById('askForm')!);
    fireEvent(window, new Event('resize'));
    // jsdom tự đặt một timer 0 ms khi focus() (Selection) — xả nó; timer của app đều ≥ 150 ms nên không bị chạy
    act(() => vi.advanceTimersByTime(0));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the moon phase with the legacy text', () => {
    renderLanding();
    expect(document.querySelector('#landingMoon svg.moon-svg.sm')).not.toBeNull();
    expect(document.querySelector('#landingMoon span')!.textContent).toMatch(/ · \d+% sáng$/);
  });
});
