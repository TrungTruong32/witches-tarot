import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes, MODE_BY_PATH, PATH_BY_MODE } from './routes';
import { initialState, useApp } from './store';

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.hash}</output>;
}
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
      <Where />
    </MemoryRouter>,
  );
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), dbStatus: 'ready', decks: ['Witches Tarot', 'Rider-Waite'], deck: 'Witches Tarot' });
});
afterEach(() => vi.restoreAllMocks());

describe('route table', () => {
  it('maps every legacy mode to a path and back', () => {
    expect(PATH_BY_MODE).toEqual({
      daily: '/hom-nay', browse: '/tra-cuu', draw: '/boc-bai', reading: '/trai-bai', history: '/nhat-ky', yesno: '/yes-no', sky: '/bau-troi',
    });
    for (const [m, p] of Object.entries(PATH_BY_MODE)) expect(MODE_BY_PATH[p]).toBe(m);
  });
});

describe('app shell', () => {
  it('nav buttons navigate, set body[data-mode], mark the active button and close the drawer', async () => {
    renderAt('/hom-nay');
    expect(document.body.dataset.mode).toBe('daily');
    expect(document.getElementById('modeDaily')!.classList.contains('active')).toBe(true);
    await userEvent.click(document.getElementById('navToggle')!);
    expect(document.getElementById('navMenu')!.classList.contains('open')).toBe(true);
    await userEvent.click(document.getElementById('modeBrowse')!);
    expect(where()).toBe('/tra-cuu');
    expect(document.body.dataset.mode).toBe('browse');
    expect(document.getElementById('modeBrowse')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('modeDaily')!.classList.contains('active')).toBe(false);
    expect(document.getElementById('navMenu')!.classList.contains('open')).toBe(false);
    expect(document.getElementById('browseView')).not.toBeNull();
  });

  it('nav buttons carry the legacy icon + label structure', () => {
    renderAt('/hom-nay');
    const b = document.getElementById('modeReading')!;
    expect(b.getAttribute('data-ico')).toBe('ball');
    expect(b.querySelector('svg.ico use')!.getAttribute('href')).toBe('#i-ball');
    expect(b.querySelector('span.lbl')!.textContent).toBe('Trải bài AI');
  });

  it('Esc closes the drawer and returns focus to the toggle', async () => {
    renderAt('/hom-nay');
    const toggle = document.getElementById('navToggle')!;
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(document.getElementById('navMenu')!.classList.contains('open')).toBe(false);
    expect(document.activeElement).toBe(toggle);
  });

  it('the scrim and the close button close the drawer', async () => {
    renderAt('/hom-nay');
    await userEvent.click(document.getElementById('navToggle')!);
    await userEvent.click(document.getElementById('navScrim')!);
    expect(document.getElementById('navMenu')!.classList.contains('open')).toBe(false);
    await userEvent.click(document.getElementById('navToggle')!);
    await userEvent.click(document.getElementById('navClose')!);
    expect(document.getElementById('navMenu')!.classList.contains('open')).toBe(false);
  });

  it('#goHome goes back to the landing', async () => {
    renderAt('/tra-cuu');
    await userEvent.click(document.getElementById('goHome')!);
    expect(where()).toBe('/');
    expect(document.getElementById('landing')).not.toBeNull();
    expect(document.getElementById('appPage')).toBeNull();
  });

  it('a share link on first load goes straight to the reading screen with the hash kept, never showing the landing', () => {
    renderAt('/#r=abc');
    expect(where()).toBe('/trai-bai#r=abc');
    expect(document.getElementById('landing')).toBeNull();
  });

  it('boot status: loading text, then hidden once ready; deck bar shows the decks', () => {
    useApp.setState({ dbStatus: 'loading' });
    renderAt('/hom-nay');
    expect(document.getElementById('bootStatus')!.textContent).toBe('Đang tải cơ sở dữ liệu SQLite…');
    act(() => useApp.setState({ dbStatus: 'ready' }));
    expect(document.getElementById('bootStatus')!.style.display).toBe('none');
    const sel = document.getElementById('deckSelect') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toEqual(['Witches Tarot', 'Rider-Waite']);
  });

  it('boot error shows the error with the status error class', () => {
    useApp.setState({ dbStatus: 'error', dbError: 'Không thể tải cơ sở dữ liệu: HTTP 404 khi tải tarot.db' });
    renderAt('/hom-nay');
    const st = document.getElementById('bootStatus')!;
    expect(st.className).toBe('status error');
    expect(st.textContent).toBe('Không thể tải cơ sở dữ liệu: HTTP 404 khi tải tarot.db');
  });

  it('changing the deck select persists the deck', async () => {
    renderAt('/hom-nay');
    await userEvent.selectOptions(document.getElementById('deckSelect')!, 'Rider-Waite');
    expect(useApp.getState().deck).toBe('Rider-Waite');
  });

  it('nav listeners are removed on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderAt('/hom-nay');
    unmount();
    const types = remove.mock.calls.map(c => c[0]);
    for (const t of ['scroll', 'resize', 'mousemove', 'beforeinstallprompt', 'appinstalled']) expect(types).toContain(t);
  });
});

describe('lightbox', () => {
  it('opens from the store with the reversed rotation, closes on click and on Esc', async () => {
    renderAt('/hom-nay');
    const box = document.getElementById('imgLightbox')!;
    expect(box.classList.contains('open')).toBe(false);
    act(() => useApp.getState().openLightbox('https://www.tarot.vn/a.jpg', true));
    expect(box.classList.contains('open')).toBe(true);
    const img = document.getElementById('lightboxImg') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://www.tarot.vn/a.jpg');
    expect(img.classList.contains('flip')).toBe(true);
    await userEvent.click(box);
    expect(box.classList.contains('open')).toBe(false);
    act(() => useApp.getState().openLightbox('https://www.tarot.vn/b.jpg', false));
    await userEvent.keyboard('{Escape}');
    expect(box.classList.contains('open')).toBe(false);
  });
});
