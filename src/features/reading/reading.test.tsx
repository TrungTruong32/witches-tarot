import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { AppRoutes } from '../../app/routes';
import { initialState, useApp } from '../../app/store';
import { MAJOR_NAMES } from '../../core/cards';
import { computeSpreadFacts, factLines } from '../../core/facts';
import { RitualOverlay } from '../../components/spread/RitualOverlay';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { stripGlyph, translate } from '../../i18n/useT';
import { Reading } from './Reading';
import { initialReading, useReading } from './readingStore';

const W = 'Witches Tarot';
const legacyHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');
const legacyDoc = new DOMParser().parseFromString(legacyHtml, 'text/html');
const legacySteps = legacyDoc.querySelector('#readingView .reading-steps')!;

let db: CardsDb;
beforeAll(async () => {
  db = openCardsDb(await makeDb(deckCards), await sqlJs());
});

let realMatchMedia: typeof window.matchMedia | undefined;
beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: W, dbStatus: 'ready' });
  useReading.setState(initialReading());
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ cancel: vi.fn() }));
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
const renderReading = () => render(<MemoryRouter><RitualOverlay /><Reading /></MemoryRouter>);
const picker = () => $<HTMLInputElement>('pickerInput');
const type = (q: string) => fireEvent.change(picker(), { target: { value: q } });
const enter = () => fireEvent.keyDown(picker(), { key: 'Enter' });
const addByName = (q: string) => { type(q); enter(); };
const tile = (k: string) => document.querySelector<HTMLButtonElement>(`#spreadPicker [data-k="${k}"]`)!;
const rows = () => [...document.querySelectorAll('#spreadList .spread-item')];
const majorName = (n: number) => db.majorNameIn(W, n) ?? MAJOR_NAMES[n] ?? null;

describe('Steps markup matches legacy', () => {
  it('same ids, classes, labels, headings and button texts in order (renamed draw buttons are the §5.8 exception)', () => {
    renderReading();
    const ours = document.querySelector('.reading .reading-steps')!;
    expect(ours).not.toBeNull();
    const skip = (e: Element) => !!e.closest('.spread-picker') || (e.classList.contains('hint') && !!e.closest('.draw-row'));
    const idCls = (root: Element) => [...root.querySelectorAll('[id]')].filter(e => !skip(e)).map(e => e.id + '.' + [...e.classList].sort().join('.'));
    expect(idCls(ours)).toEqual(idCls(legacySteps));
    const texts = (root: Element, sel: string) =>
      [...root.querySelectorAll(sel)].filter(e => !skip(e) && !['spreadDrawBtn', 'spreadPickBtn'].includes(e.id)).map(e => e.textContent!.replace(/\s+/g, ' ').trim());
    for (const sel of ['label', 'h3', '.step-desc', '.step-no', '.manual-add summary', '.picker-nav', '#spreadStopShuffle, #clearSpreadBtn', '.step-sub'])
      expect(texts(ours, sel), sel).toEqual(texts(legacySteps, sel));
    const attrs = (root: Element) => [...root.querySelectorAll('input, textarea, select')].map(i =>
      ['id', 'type', 'min', 'max', 'rows', 'placeholder', 'hidden', 'tabindex', 'aria-hidden', 'aria-label', 'title', 'inputmode'].map(a => i.getAttribute(a)).join('|'));
    expect(attrs(ours)).toEqual(attrs(legacySteps));
    // chip có icon (initIcons: data-ico + nhãn bỏ ký hiệu đầu)
    expect(texts(ours, '.qchip')).toEqual(texts(legacySteps, '.qchip').map(stripGlyph));
    expect([...ours.querySelectorAll('.qchip')].map(b => b.getAttribute('data-ico'))).toEqual(['heart', 'wand', 'coin', 'compass', 'eye']);
    expect([...ours.querySelectorAll('.qchip')].map(b => b.getAttribute('data-q'))).toEqual([...legacySteps.querySelectorAll('.qchip')].map(b => b.getAttribute('data-q')));
    // #interpretBtn có icon (initIcons của bản cũ) → nhãn bỏ ký hiệu đầu như setLabel
    expect($('interpretBtn').textContent).toBe(stripGlyph(legacySteps.querySelector('#interpretBtn')!.textContent!));
    expect($('spreadDrawBtn').textContent).toBe(translate('vi', 'draw.auto'));
    expect($('spreadPickBtn').textContent).toBe(translate('vi', 'draw.manual'));
    expect($('readingDeckInfo').hidden).toBe(true);
    expect($('readingDeckInfo').textContent).toContain('Đang trải bằng bộ: “Witches Tarot”.');
    expect($('spreadBoard').hidden).toBe(true);
    expect(document.querySelector('#spreadList .empty-spread')!.textContent).toBe('Chưa có lá nào — bấm “Xào & bốc” ở bước 3 để rút bài.');
    expect($<HTMLButtonElement>('interpretBtn').disabled).toBe(true);
    expect($<HTMLButtonElement>('clearSpreadBtn').disabled).toBe(true);
    expect($('spreadFacts').style.display).toBe('none');
    expect($('spreadHint').textContent).toBe('Thêm/bốc số lá tuỳ ý; không gắn nhãn vị trí.');
    expect([...$<HTMLSelectElement>('spreadType').options].map(o => o.value)[0]).toBe('free');
    const panel = $('resultPanel');
    expect(panel.className).toBe('panel result-panel is-empty');
    expect(panel.previousElementSibling).toBe(ours);
  });

  it('chips fill the question in the current language', () => {
    renderReading();
    fireEvent.click(document.querySelectorAll('.qchip')[0]!);
    expect($<HTMLTextAreaElement>('questionInput').value).toBe('Tình cảm của tôi thời gian tới sẽ thế nào?');
    expect(useReading.getState().question).toBe('Tình cảm của tôi thời gian tới sẽ thế nào?');
    act(() => useApp.getState().setLang('en'));
    fireEvent.click(document.querySelectorAll('.qchip')[0]!);
    expect($<HTMLTextAreaElement>('questionInput').value).toBe('How will my love life unfold in the near future?');
  });

  it('cloud note toggles prefs.cloudSave with legacy texts', () => {
    renderReading();
    expect($('cloudNote').textContent).toBe('☁︎ Trải bài được lưu ẩn danh (không tên, email hay IP) để cải thiện app · tắt');
    fireEvent.click($('cloudNote').querySelector('[data-cloud-off]')!);
    expect(useApp.getState().prefs.cloudSave).toBe(false);
    expect(localStorage.getItem('tarotCloudSave')).toBe('0');
    expect($('cloudNote').textContent).toBe('Trải bài chỉ lưu trong máy bạn · bật lưu ẩn danh');
    fireEvent.click($('cloudNote').querySelector('[data-cloud-on]')!);
    expect(useApp.getState().prefs.cloudSave).toBe(true);
  });
});

describe('Spread type', () => {
  it('choosing celtic locks #spreadDrawCount to 10; back to free keeps 10 but unlocks; hint lists positions', () => {
    renderReading();
    fireEvent.click(tile('celtic'));
    expect(useReading.getState().spreadKey).toBe('celtic');
    expect($<HTMLSelectElement>('spreadType').value).toBe('celtic');
    const cnt = $<HTMLInputElement>('spreadDrawCount');
    expect(cnt.disabled).toBe(true);
    expect(cnt.value).toBe('10');
    expect($('spreadHint').querySelectorAll('div').length).toBe(11);
    expect($('spreadHint').querySelector('div:nth-child(2)')!.innerHTML).toMatch(/^1\. <strong>[^<]+<\/strong> — /);
    fireEvent.click(tile('free'));
    expect(cnt.disabled).toBe(false);
    expect(cnt.value).toBe('10');
  });

  it('the free-spread count is remembered when leaving the screen and coming back', () => {
    const first = renderReading();
    fireEvent.change($('spreadDrawCount'), { target: { value: '7' } });
    first.unmount();
    renderReading();
    expect($<HTMLInputElement>('spreadDrawCount').value).toBe('7');
  });

  it('a spread set from outside (shared link / History) locks the count too', () => {
    useReading.getState().setSpreadKey('celtic');
    renderReading();
    expect($<HTMLInputElement>('spreadDrawCount').value).toBe('10');
    fireEvent.click(tile('free'));
    expect($<HTMLInputElement>('spreadDrawCount').value).toBe('10');
  });
});

describe('Manual add', () => {
  it('typing lists results; Enter adds the active one; .dup marks cards in the spread; ↓ moves the active row', () => {
    renderReading();
    type('fool');
    const items = () => [...document.querySelectorAll('#pickerResults .picker-item')];
    expect(items().length).toBeGreaterThan(0);
    expect(items()[0]!.querySelector('strong')!.textContent).toBe('0 - The Fool');
    expect(items()[0]!.classList.contains('active')).toBe(true);
    enter();
    expect(useReading.getState().cards.map(c => c.ten)).toEqual(['The Fool']);
    expect(picker().value).toBe('');
    expect($('pickerResults').innerHTML).toBe('');
    expect(document.activeElement).toBe(picker());
    type('fool');
    expect(items()[0]!.classList.contains('dup')).toBe(true);
    expect(items()[0]!.querySelector('span')!.textContent).toContain(' · đã có trong trải bài');
    type('cups');
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    expect(items()[1]!.classList.contains('active')).toBe(true);
    fireEvent.keyDown(picker(), { key: 'Escape' });
    expect(picker().value).toBe('');
    type('zzzzzz');
    expect(document.querySelector('#pickerResults .picker-empty')).not.toBeNull();
  });

  it('a new result list (deck switch with the same query) makes the first row active again', () => {
    renderReading();
    type('cups');
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    expect(document.querySelectorAll('#pickerResults .picker-item')[1]!.classList.contains('active')).toBe(true);
    act(() => useApp.getState().setDeck('Rider-Waite'));
    const items = [...document.querySelectorAll('#pickerResults .picker-item')];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.classList.contains('active')).toBe(true);
  });

  it('IME composition Enter does not add', () => {
    renderReading();
    type('fool');
    fireEvent.keyDown(picker(), { key: 'Enter', isComposing: true });
    expect(useReading.getState().cards).toHaveLength(0);
  });

  it('on `one`, a second add is refused and the input is cleared', () => {
    renderReading();
    fireEvent.click(tile('one'));
    addByName('fool');
    expect(useReading.getState().cards).toHaveLength(1);
    addByName('tower');
    expect(useReading.getState().cards).toHaveLength(1);
    expect(picker().value).toBe('');
    expect($('pickerResults').innerHTML).toBe('');
  });
});

describe('Spread list', () => {
  it('rows show number, position badge with posDesc title, name, suit; Ngược toggles the store; ✕ removes', () => {
    renderReading();
    fireEvent.click(tile('ppf'));
    addByName('fool');
    addByName('tower');
    expect(rows()).toHaveLength(2);
    const badge = rows()[0]!.querySelector('.pos-badge')!;
    expect(badge.textContent).toBe('Quá khứ');
    expect(badge.getAttribute('title')).toBe('gốc rễ, điều đã dẫn tới tình huống');
    expect(rows()[0]!.querySelector('.name strong')!.textContent).toBe('1. Quá khứ The Fool');
    expect(rows()[0]!.querySelector('.name > span')!.textContent).toBe('Bo An Chinh');
    expect(rows()[0]!.querySelector('.spread-flip.revealed img')).not.toBeNull();
    expect(rows()[0]!.querySelector('.orient .xuoi')!.classList.contains('on')).toBe(true);
    fireEvent.click(rows()[1]!.querySelector('.orient .nguoc')!);
    expect(useReading.getState().cards[1]!.orientation).toBe('nguoc');
    expect(rows()[1]!.querySelector('.orient .nguoc')!.classList.contains('on')).toBe(true);
    expect(rows()[1]!.querySelector('img')!.classList.contains('rev')).toBe(true);
    expect($<HTMLButtonElement>('interpretBtn').disabled).toBe(false);
    fireEvent.click(rows()[0]!.querySelector('.rm')!);
    expect(useReading.getState().cards.map(c => c.ten)).toEqual(['The Tower']);
    fireEvent.click($('clearSpreadBtn'));
    expect(useReading.getState().cards).toHaveLength(0);
    expect($<HTMLButtonElement>('clearSpreadBtn').disabled).toBe(true);
  });

  it('clicking a revealed thumb opens the lightbox (reversed flag)', () => {
    renderReading();
    addByName('fool');
    fireEvent.click(rows()[0]!.querySelector('.orient .nguoc')!);
    fireEvent.click(rows()[0]!.querySelector('.spread-flip')!);
    expect(useApp.getState().lightbox).toEqual({ url: deckCards[0]!.image_url, reversed: true });
  });

  it("reveal 'seq' (hand-off from Draw) flips list thumbs at 220 + idx·240 ms", () => {
    const cards = deckCards.slice(0, 3).map((c, i) => ({ ...c, orientation: 'xuoi' as const, uid: 1000 + i }));
    useReading.getState().setCards(cards, 'seq');
    renderReading();
    const revealed = () => document.querySelectorAll('#spreadList .spread-flip.revealed').length;
    expect(revealed()).toBe(0);
    act(() => vi.advanceTimersByTime(220));
    expect(revealed()).toBe(1);
    act(() => vi.advanceTimersByTime(480));
    expect(revealed()).toBe(3);
    expect(useReading.getState().reveal).toBe('none');
  });
});

describe('Facts', () => {
  it('appear at 2 cards with the legacy factLines text (major names from the deck)', () => {
    renderReading();
    addByName('fool');
    expect($('spreadFacts').style.display).toBe('none');
    addByName('shadow side');
    const box = $('spreadFacts');
    expect(box.style.display).toBe('');
    expect(box.querySelector('summary')!.textContent).toBe('📊 Dữ kiện trải bài (tính tự động, gửi kèm cho AI)');
    const cards = useReading.getState().cards;
    const want = factLines(cards, computeSpreadFacts(cards), 'vi', majorName).map(l => '• ' + l);
    expect(want.length).toBeGreaterThan(0);
    expect([...box.querySelectorAll('.facts-body > div')].map(d => d.textContent)).toEqual(want);
  });
});

describe('Language switch (Review Focus 5)', () => {
  it('re-renders position labels, picker, hint and facts in EN', () => {
    renderReading();
    fireEvent.click(tile('ppf'));
    addByName('fool');
    addByName('tower');
    act(() => useApp.getState().setLang('en'));
    expect(rows()[0]!.querySelector('.pos-badge')!.textContent).toBe('Past');
    expect(rows()[0]!.querySelector('.pos-badge')!.getAttribute('title')).toBe('roots — what led to the situation');
    expect(rows()[0]!.querySelector('.orient .xuoi')!.textContent).toBe('Upright');
    expect(tile('ppf').querySelector('.sp-badge')!.textContent).toBe('✓ Selected');
    expect($('spreadHint').textContent).toContain('1. Past — roots');
    expect($('spreadFacts').querySelector('summary')!.textContent).toBe('📊 Spread facts (computed, sent to the AI)');
    const cards = useReading.getState().cards;
    expect([...$('spreadFacts').querySelectorAll('.facts-body > div')].map(d => d.textContent))
      .toEqual(factLines(cards, computeSpreadFacts(cards), 'en', majorName).map(l => '• ' + l));
    expect($('readingDeckInfo').textContent).toContain('Reading with deck: “Witches Tarot”.');
    type('fool');
    expect(document.querySelector('#pickerResults .picker-item span')!.textContent).toContain(' · already in spread');
    expect($<HTMLTextAreaElement>('questionInput').placeholder).toBe('E.g. What should I focus on in love right now?');
  });
});

describe('Draw into the spread', () => {
  it('reduced motion: ✋ pick → cards in the store, fan hidden, board dealt, list not pending', async () => {
    act(() => useApp.getState().setPref('ritualOff', true));
    stubReduce();
    renderReading();
    fireEvent.click(tile('ppf'));
    fireEvent.click($('spreadPickBtn'));
    const wc = document.querySelectorAll<HTMLElement>('#spreadFan .wcard');
    act(() => { fireEvent.click(wc[0]!); fireEvent.click(wc[1]!); fireEvent.click(wc[2]!); });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(useReading.getState().cards).toHaveLength(3);
    expect(rows()).toHaveLength(3);
    expect($('spreadFan').style.display).toBe('none');
    expect(document.querySelectorAll('#spreadBoard .board-card.revealed')).toHaveLength(3);
    expect($('spreadList').classList.contains('pending')).toBe(false);
  });

  it('shuffle → stop: list is .pending until the deal ends, then the board cards are revealed', async () => {
    act(() => useApp.getState().setPref('ritualOff', true));
    renderReading();
    fireEvent.click(tile('ppf'));
    // Bánh xe tự rút (wheel.ts, như bản cũ L5453) có thể trùng chỉ số giữa hai đoạn kề nhau → treo; cố định random để test ổn định
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click($('spreadDrawBtn'));
    fireEvent.click($('spreadStopShuffle'));
    for (let i = 0; i < 300 && !useReading.getState().cards.length; i++) act(() => vi.advanceTimersByTime(100));
    expect(useReading.getState().cards).toHaveLength(3);
    expect($('spreadList').classList.contains('pending')).toBe(true);
    expect(document.querySelectorAll('#spreadBoard .board-card.await')).toHaveLength(3);
    await act(async () => { vi.advanceTimersByTime(1600 + 450 + 5000); });
    expect($('spreadFan').style.display).toBe('none');
    expect($('spreadList').classList.contains('pending')).toBe(false);
    expect(document.querySelectorAll('#spreadBoard .board-card.revealed')).toHaveLength(3);
  });
});

function Nav() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (
    <>
      <output data-testid="where">{loc.pathname}</output>
      <button data-testid="toBrowse" onClick={() => navigate('/tra-cuu')} />
      <button data-testid="toReading" onClick={() => navigate('/trai-bai')} />
      <button data-testid="back" onClick={() => navigate(-1)} />
    </>
  );
}

describe('Routing', () => {
  it('state survives navigating to /tra-cuu and back', () => {
    render(<MemoryRouter initialEntries={['/trai-bai']}><AppRoutes /><Nav /></MemoryRouter>);
    fireEvent.change($('questionInput'), { target: { value: 'Câu hỏi?' } });
    fireEvent.click(tile('ppf'));
    addByName('fool');
    fireEvent.click(screen.getByTestId('toBrowse'));
    expect($('readingView')).toBeNull();
    fireEvent.click(screen.getByTestId('toReading'));
    expect($<HTMLTextAreaElement>('questionInput').value).toBe('Câu hỏi?');
    expect(tile('ppf').getAttribute('aria-checked')).toBe('true');
    expect(rows()).toHaveLength(1);
  });

  it('leaving mid-deal and coming back shows the cards revealed, list not pending', () => {
    act(() => useApp.getState().setPref('ritualOff', true));
    render(<MemoryRouter initialEntries={['/trai-bai']}><AppRoutes /><Nav /></MemoryRouter>);
    fireEvent.click(tile('ppf'));
    // Bánh xe tự rút (wheel.ts, như bản cũ L5453) có thể trùng chỉ số giữa hai đoạn kề nhau → treo; cố định random để test ổn định
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click($('spreadDrawBtn'));
    fireEvent.click($('spreadStopShuffle'));
    for (let i = 0; i < 300 && !useReading.getState().cards.length; i++) act(() => vi.advanceTimersByTime(100));
    expect($('spreadList').classList.contains('pending')).toBe(true);
    fireEvent.click(screen.getByTestId('toBrowse'));
    act(() => vi.advanceTimersByTime(10000));
    fireEvent.click(screen.getByTestId('toReading'));
    expect($('spreadList').classList.contains('pending')).toBe(false);
    expect(document.querySelectorAll('#spreadBoard .board-card.revealed')).toHaveLength(3);
  });

  it('Landing entry {question, autoPick} pre-fills the question and, after 380 ms, clicks #spreadPickBtn (ritual opens)', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(
      <MemoryRouter initialEntries={[{ pathname: '/trai-bai', state: { question: 'Q', autoPick: true } }]}>
        <RitualOverlay />
        <Routes><Route path="/trai-bai" element={<Reading />} /></Routes>
      </MemoryRouter>,
    );
    expect($<HTMLTextAreaElement>('questionInput').value).toBe('Q');
    expect(useReading.getState().question).toBe('Q');
    expect($('ritualOverlay').style.display).toBe('none');
    act(() => vi.advanceTimersByTime(379));
    expect($('ritualOverlay').style.display).toBe('none');
    act(() => vi.advanceTimersByTime(1));
    expect(scroll.mock.contexts).toContain($('spreadPickBtn'));
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect($('ritualOverlay').style.display).toBe('flex');
    expect($('ritualQ').textContent).toBe('“Q”');
  });

  it('autoPick under the full AppRoutes (ResetOverlaysOnNavigate, ritual on): the ritual opens after 380 ms', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/trai-bai', state: { question: 'Q', autoPick: true } }]}>
        <AppRoutes /><Nav />
      </MemoryRouter>,
    );
    expect($<HTMLTextAreaElement>('questionInput').value).toBe('Q');
    act(() => vi.advanceTimersByTime(379));
    expect($('ritualOverlay').style.display).toBe('none');
    act(() => vi.advanceTimersByTime(1));
    expect($('ritualOverlay').style.display).toBe('flex');
    expect($('ritualQ').textContent).toBe('“Q”');
  });

  it('leaving before 380 ms: no pick fires, and Back to the entry does not replay it (state consumed)', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/trai-bai', state: { question: 'Q', autoPick: true } }]}>
        <AppRoutes /><Nav />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(screen.getByTestId('toBrowse'));
    act(() => vi.advanceTimersByTime(1000));
    expect(useApp.getState().ritual).toBeNull();
    useReading.getState().setQuestion('typed later');
    fireEvent.click(screen.getByTestId('back'));
    expect(screen.getByTestId('where').textContent).toBe('/trai-bai');
    act(() => vi.advanceTimersByTime(1000));
    expect(useApp.getState().ritual).toBeNull();
    expect($('ritualOverlay').style.display).toBe('none');
    expect($<HTMLTextAreaElement>('questionInput').value).toBe('typed later');
  });

  it("leaving mid-'seq' and coming back shows every thumb revealed (no replay)", async () => {
    const cards = deckCards.slice(0, 3).map((c, i) => ({ ...c, orientation: 'xuoi' as const, uid: 2000 + i }));
    useReading.getState().setCards(cards, 'seq');
    render(<MemoryRouter initialEntries={['/trai-bai']}><AppRoutes /><Nav /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(220));
    expect(document.querySelectorAll('#spreadList .spread-flip.revealed')).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getByTestId('toBrowse')); });
    expect(useReading.getState().reveal).toBe('none');
    fireEvent.click(screen.getByTestId('toReading'));
    expect(document.querySelectorAll('#spreadList .spread-flip.revealed')).toHaveLength(3);
  });
});
