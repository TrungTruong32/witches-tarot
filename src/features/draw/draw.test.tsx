import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { AppRoutes } from '../../app/routes';
import { preloadLazyScreens } from '../../app/lazyScreens';
import { initialState, useApp } from '../../app/store';
import type { SpreadCard } from '../../core/types';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { initialReading, useReading } from '../reading/readingStore';
import { initialDraw, useDraw } from './drawStore';

const W = 'Witches Tarot';

let db: CardsDb;
beforeAll(async () => {
  await preloadLazyScreens(); // màn hình tải lười (React.lazy): nạp trước để render đồng bộ như trước
  db = openCardsDb(await makeDb(deckCards), await sqlJs());
});

let realMatchMedia: typeof window.matchMedia | undefined;
beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: W, dbStatus: 'ready' });
  useApp.getState().setPref('ritualOff', true);
  useReading.setState(initialReading());
  useDraw.setState(initialDraw());
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ cancel: vi.fn() }));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  realMatchMedia = window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  window.matchMedia = realMatchMedia as typeof window.matchMedia;
  vi.restoreAllMocks();
});

const stubReduce = () => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const tile = (k: string) => document.querySelector<HTMLButtonElement>(`#drawSpreadPicker [data-k="${k}"]`)!;
const drawCards = () => [...document.querySelectorAll<HTMLElement>('#drawResults .draw-card')];
const names = () => drawCards().map(d => d.querySelector('.draw-name')!.textContent!);

function Nav() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (
    <>
      <output data-testid="where">{loc.pathname}</output>
      <button data-testid="toBrowse" onClick={() => navigate('/tra-cuu')} />
      <button data-testid="toDraw" onClick={() => navigate('/boc-bai')} />
    </>
  );
}
const renderDraw = () => render(<MemoryRouter initialEntries={['/boc-bai']}><AppRoutes /><Nav /></MemoryRouter>);

/** ✋ chọn tay n lá trên bánh xe (giảm chuyển động: không xào). */
const pickBy = async (n: number) => {
  fireEvent.click($('pickBtn'));
  const wc = document.querySelectorAll<HTMLElement>('#drawFan .wcard');
  act(() => { for (let i = 0; i < n; i++) fireEvent.click(wc[i]!); });
  await act(async () => { vi.advanceTimersByTime(10); });
};

describe('Draw tab layout', () => {
  it('renders the legacy shell: moon badge, deck info, picker, controls, orbit, status, fan, board, results', () => {
    renderDraw();
    expect($('drawView')).not.toBeNull();
    expect(document.querySelector('#drawView .panel #moonBadge.moon-badge .m-name')!.textContent).toMatch(/ · \d+% sáng$/);
    expect(document.querySelector('#moonBadge .m-emoji svg')).not.toBeNull();
    expect($('drawInfo').textContent).toBe('Bốc từ bộ: “Witches Tarot”. Xào ngẫu nhiên và tự chọn chiều Xuôi/Ngược (lá không có nghĩa ngược sẽ để Xuôi). Đổi bộ ở thanh “Bộ bài” phía trên.');
    expect($('drawSpreadPicker')).not.toBeNull();
    for (const id of ['drawBtn', 'pickBtn', 'stopShuffle', 'soundToggle', 'drawToReading', 'drawCount'])
      expect(document.querySelector(`.draw-controls #${id}`), id).not.toBeNull();
    expect(document.querySelector('label[for="drawCount"]')!.textContent).toBe('Số lá:');
    expect($<HTMLInputElement>('drawCount').value).toBe('3');
    expect($('soundToggle').title).toBe('Bật/tắt tiếng xào');
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(true);
    expect($('drawToReading').querySelector('svg.ico use')!.getAttribute('href')).toBe('#i-ball');
    expect($('drawOrbit').className).toBe('riffle');
    expect($('pickStatus')).not.toBeNull();
    expect($('drawFan').className).toBe('fan');
    expect($('drawBoard').classList.contains('spread-board')).toBe(true);
    expect($('drawResults').className).toBe('draw-results');
    expect($('spreadList')).toBeNull();
  });

  it('a fixed spread hides #drawCount and shows its empty numbered slots', () => {
    renderDraw();
    fireEvent.click(tile('ppf'));
    expect($('drawCount')).toBeNull();
    expect(useDraw.getState().spreadKey).toBe('ppf');
    expect(document.querySelectorAll('#drawBoard .board-slot')).toHaveLength(3);
    fireEvent.click(tile('free'));
    expect($('drawCount')).not.toBeNull();
  });
});

describe('Drawing', () => {
  it('ppf + reduced motion: ✋ 3 cards → 3 board cards and 3 .draw-card named by position', async () => {
    stubReduce();
    renderDraw();
    fireEvent.click(tile('ppf'));
    await pickBy(3);
    expect(useDraw.getState().result).toHaveLength(3);
    expect(document.querySelectorAll('#drawBoard .board-card.revealed')).toHaveLength(3);
    expect($('drawFan').style.display).toBe('none');
    const r = useDraw.getState().result;
    expect(names().map(n => n.replace(/\s+(Xuôi|Ngược)$/, ''))).toEqual([
      '1. Quá khứ — ' + r[0]!.ten, '2. Hiện tại — ' + r[1]!.ten, '3. Tương lai — ' + r[2]!.ten,
    ]);
    expect(drawCards().every(d => d.classList.contains('revealed') && d.querySelector('.flip.revealed'))).toBe(true);
    expect(r.every(c => typeof c.uid === 'number')).toBe(true);
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(false);
  });

  it('the free-spread count is remembered when leaving the screen and coming back', () => {
    renderDraw();
    fireEvent.change($('drawCount'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('toBrowse'));
    fireEvent.click(screen.getByTestId('toDraw'));
    expect($<HTMLInputElement>('drawCount').value).toBe('6');
  });

  it('changing the spread while shuffling cancels the draw (Stop hidden, buttons back, nothing drawn)', () => {
    renderDraw();
    fireEvent.click($('drawBtn'));
    expect($('stopShuffle').style.display).toBe('inline-block');
    fireEvent.click(tile('ppf'));
    expect($('stopShuffle').style.display).toBe('none');
    expect($<HTMLButtonElement>('drawBtn').disabled).toBe(false);
    expect($('drawOrbit').classList.contains('on')).toBe(false);
    act(() => vi.advanceTimersByTime(20000));
    expect(useDraw.getState().result).toHaveLength(0);
  });

  it('changing the spread while the wheel is drawing cancels it (fan + status hidden, onPicked never fires)', () => {
    renderDraw();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click($('drawBtn'));
    fireEvent.click($('stopShuffle'));
    act(() => vi.advanceTimersByTime(300));
    expect($('drawFan').style.display).not.toBe('none');
    fireEvent.click(tile('ppf'));
    expect($('drawFan').style.display).toBe('none');
    expect($('pickStatus').style.display).toBe('none');
    act(() => vi.advanceTimersByTime(30000));
    expect(useDraw.getState().result).toHaveLength(0);
    expect(drawCards()).toHaveLength(0);
  });

  it('"Tự do" with #drawCount = 5 draws 5, named "1. <name>"', async () => {
    stubReduce();
    renderDraw();
    fireEvent.change($('drawCount'), { target: { value: '5' } });
    await pickBy(5);
    expect(useDraw.getState().result).toHaveLength(5);
    expect(drawCards()).toHaveLength(5);
    expect(names()[0]!.startsWith('1. ' + useDraw.getState().result[0]!.ten + ' ')).toBe(true);
  });

  it('#drawToReading stays disabled until the deal ends; clicking it hands off to /trai-bai with seq reveal', async () => {
    renderDraw();
    fireEvent.click(tile('ppf'));
    // Cố định random để bánh xe tự rút ổn định (như reading.test)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click($('drawBtn'));
    fireEvent.click($('stopShuffle'));
    for (let i = 0; i < 300 && !useDraw.getState().result.length; i++) act(() => vi.advanceTimersByTime(100));
    expect(useDraw.getState().result).toHaveLength(3);
    expect(document.querySelectorAll('#drawBoard .board-card.await')).toHaveLength(3);
    expect(drawCards()).toHaveLength(0);
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(true);
    // vòng lặp trên có thể đã vượt quá thời điểm bốc xong tối đa 100 ms
    act(() => vi.advanceTimersByTime(1450));
    expect($('drawFan').style.display).not.toBe('none');
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    act(() => vi.advanceTimersByTime(150));
    expect($('drawFan').style.display).toBe('none');
    expect(scroll.mock.contexts).toContain($('drawBoard'));
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(450 + 5000); });
    expect(document.querySelectorAll('#drawBoard .board-card.revealed')).toHaveLength(3);
    expect(drawCards()).toHaveLength(3);
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(false);

    const drawn = useDraw.getState().result;
    fireEvent.click($('drawToReading'));
    expect(screen.getByTestId('where').textContent).toBe('/trai-bai');
    const st = useReading.getState();
    expect(st.spreadKey).toBe('ppf');
    expect(st.cards.map(c => c.id)).toEqual(drawn.map(c => c.id));
    expect(st.cards.map(c => c.orientation)).toEqual(drawn.map(c => c.orientation));
    expect(st.cards.every((c, i) => typeof c.uid === 'number' && c.uid !== drawn[i]!.uid)).toBe(true);
    expect(st.reveal).toBe('seq');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('a new draw clears the previous results and disables #drawToReading', async () => {
    stubReduce();
    renderDraw();
    await pickBy(3);
    expect(drawCards()).toHaveLength(3);
    fireEvent.click($('pickBtn'));
    expect(drawCards()).toHaveLength(0);
    expect(useDraw.getState().result).toHaveLength(0);
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(true);
  });

  it('leaving mid-deal and returning shows the board revealed, the results, and an enabled hand-off', () => {
    renderDraw();
    fireEvent.click(tile('ppf'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click($('drawBtn'));
    fireEvent.click($('stopShuffle'));
    for (let i = 0; i < 300 && !useDraw.getState().result.length; i++) act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByTestId('toBrowse'));
    act(() => vi.advanceTimersByTime(10000));
    fireEvent.click(screen.getByTestId('toDraw'));
    expect(tile('ppf').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelectorAll('#drawBoard .board-card.revealed')).toHaveLength(3);
    expect(drawCards()).toHaveLength(3);
    expect($<HTMLButtonElement>('drawToReading').disabled).toBe(false);
  });
});

describe('Results text', () => {
  const card = (extra: Partial<SpreadCard>): SpreadCard => ({
    id: 7, uid: 900, deck: W, bo: 'Ẩn Chính', so: '0', ten: 'The Fool', tu_khoa: 'k', y_nghia_xuoi: 'xuôi', nghia_nguoc: 'ngược',
    image_url: null, orientation: 'xuoi', ...extra,
  } as SpreadCard);

  it('meaning goes through renderMarkdown (escaped); reversed shows the Ngược badge and noimg text', () => {
    useDraw.setState({
      spreadKey: 'free',
      result: [card({ orientation: 'nguoc', nghia_nguoc: '**đậm** <img src=x onerror=alert(1)>' })],
    });
    renderDraw();
    const d = drawCards()[0]!;
    expect(d.querySelector('.draw-name')!.textContent).toBe('1. The Fool Ngược');
    expect(d.querySelector('.orient-badge.nguoc')!.textContent).toBe('Ngược');
    expect(d.querySelector('.time')!.textContent).toBe('Ẩn Chính');
    expect(d.querySelector('.flip-back .noimg')!.textContent).toBe('The Fool (ngược)');
    const out = d.querySelector('.ai-output')!;
    expect(out.querySelector('strong')!.textContent).toBe('đậm');
    expect(out.querySelector('img')).toBeNull();
    expect(out.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('follows the language: EN badge and English meaning from cardEn', () => {
    useApp.setState({ lang: 'en', cardEn: { 7: { kw: 'kw', up: 'English upright', rev: 'English reversed' } } as never });
    useDraw.setState({ spreadKey: 'ppf', result: [card({})] });
    renderDraw();
    const d = drawCards()[0]!;
    expect(d.querySelector('.draw-name')!.textContent).toBe('1. Past — The Fool Upright');
    expect(d.querySelector('.ai-output')!.textContent).toBe('English upright');
    expect($('drawInfo').textContent!.startsWith('Drawing from deck: “Witches Tarot”.')).toBe(true);
  });
});

describe('Sound toggle', () => {
  it('flips prefs.soundOn and the legacy opacity/line-through style', () => {
    renderDraw();
    const b = $('soundToggle');
    expect(useApp.getState().prefs.soundOn).toBe(true);
    expect(b.textContent).toBe('♫︎');
    expect(b.style.opacity).toBe('');
    fireEvent.click(b);
    expect(useApp.getState().prefs.soundOn).toBe(false);
    expect(b.style.opacity).toBe('0.45');
    expect(b.style.textDecoration).toBe('line-through');
    fireEvent.click(b);
    expect(useApp.getState().prefs.soundOn).toBe(true);
    expect(b.style.opacity).toBe('');
    expect(b.style.textDecoration).toBe('');
  });
});
