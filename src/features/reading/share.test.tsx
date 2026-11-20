import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { loadLegacyWithContext } from '../../../tests/legacy/harness';
import { initialState, useApp } from '../../app/store';
import { dailyKey } from '../../core/daily';
import { toSpreadCard } from '../../core/draw';
import { buildShareData, encodeShare, type ShareData } from '../../core/share';
import type { Card, Reading as ReadingRecord, SpreadCard } from '../../core/types';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { initialInterpret, useInterpret } from './interpret';
import { Reading } from './Reading';
import { initialReading, useReading } from './readingStore';
import { __resetSharedHash, exportReadingImage, loadReading } from './share';

const W = 'Witches Tarot';
const R = 'Rider-Waite';
const NOTE_VI = '🔗 Trải bài được chia sẻ qua link — nội dung do người gửi tạo và có thể đã bị chỉnh sửa. Witches Tarot không bao giờ yêu cầu chuyển tiền hay thông tin cá nhân.';

let db: CardsDb;
beforeAll(async () => {
  db = openCardsDb(await makeDb(deckCards), await sqlJs());
});

const fixture = (deck: string, ten: string): Card => deckCards.find(c => c.deck === deck && c.ten === ten) as Card;
const card = (ten: string, o: 'xuoi' | 'nguoc' = 'xuoi', deck = W): SpreadCard => toSpreadCard({ ...fixture(deck, ten), orientation: o });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const renderAt = (entry = '/trai-bai') => render(<MemoryRouter initialEntries={[entry]}><Reading /></MemoryRouter>);

// Bản cũ: buildShareData + encodeShare (tạo link) và loadSharedFromHash (mở link) chạy trong sandbox
type LegacyMake = { encodeShare(o: unknown): Promise<string>; buildShareData(): ShareData };
const mk = loadLegacyWithContext<LegacyMake>(
  ['b64e', 'b64eBin', 'encodeShare', 'readingDecks', 'SPREADS', 'SPREAD_DEFS', 'currentSpreadKey', 'buildShareData'],
  { $: (id: string) => (id === 'spreadType' ? { value: 'ppf' } : null), spread: [], spreadPositions: null, selectedDeck: null, lastAnswerText: '', questionInput: { value: '' } },
);
type LegacyOpen = { loadSharedFromHash(): Promise<boolean> };
const legacyLoaded: unknown[] = [];
const open = loadLegacyWithContext<LegacyOpen>(
  ['b64d', 'b64dBin', 'decodeShare', 'SPREADS', 'SPREAD_BY_KEY', 'SPREAD_DEFS', 'SPREAD_SAFE_DECKS', 'loadSharedFromHash'],
  {
    location: { hash: '' },
    cardByIdAnyDeck: (id: number) => deckCards.find(c => c.id === id) ?? null,
    loadReading: (it: unknown) => legacyLoaded.push(it),
    document: { createElement: () => ({}) },
    aiOutput: { firstChild: null, prepend() {}, appendChild() {} },
    lang: 'vi',
  },
);

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: W, dbStatus: 'ready' });
  useReading.setState(initialReading());
  useInterpret.setState(initialInterpret());
  __resetSharedHash();
  (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ cancel: vi.fn(), playbackRate: 1 }));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  legacyLoaded.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function legacyLink(cards: SpreadCard[], q: string, a: string): Promise<string> {
  Object.assign(mk.ctx, { spread: cards, questionInput: { value: q }, lastAnswerText: a, selectedDeck: W });
  return '#r=' + (await mk.fns.encodeShare(mk.fns.buildShareData()));
}

describe('#r= deep link', () => {
  it('opens a link made by the legacy encoder (ppf, one reversed card) — question, spread, cards, answer, shared note', async () => {
    const spread = [card('The Fool'), card('The Tower', 'nguoc'), card('Two of Cups')];
    const hash = await legacyLink(spread, 'Tình yêu sẽ ra sao?', '**Tóm tắt**: mọi thứ ổn ✨');
    renderAt('/trai-bai' + hash);
    await waitFor(() => expect(useReading.getState().cards).toHaveLength(3));
    const s = useReading.getState();
    expect(s.question).toBe('Tình yêu sẽ ra sao?');
    expect(s.spreadKey).toBe('ppf');
    expect(s.cards.map(c => [c.id, c.orientation])).toEqual(spread.map(c => [c.id, c.orientation]));
    expect(new Set(s.cards.map(c => c.uid)).size).toBe(3);
    expect(s.cards.every(c => !spread.some(x => x.uid === c.uid))).toBe(true); // uid mới
    expect(s.answer).toBe('**Tóm tắt**: mọi thứ ổn ✨');
    expect(s.current).toBeNull();
    expect(s.reveal).toBe('none');
    expect(s.aiBg).toBe('done');
    await waitFor(() => expect($('aiOutput').querySelector('.shared-note')?.textContent).toBe(NOTE_VI));
    expect($('aiOutput').firstElementChild?.className).toBe('shared-note');
    expect($('aiOutput').textContent).toContain('mọi thứ ổn');
    expect($('shareLinkBtn').style.display).toBe('inline-block');
    expect($('readingNoteWrap').style.display).toBe('none');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('waits for the DB, then loads the link exactly once (remount does not reload)', async () => {
    useApp.setState({ dbStatus: 'loading' });
    const hash = await legacyLink([card('Karma', 'nguoc')], 'q', 'a');
    const v = renderAt('/trai-bai' + hash);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(useReading.getState().cards).toHaveLength(0);
    act(() => useApp.setState({ dbStatus: 'ready' }));
    await waitFor(() => expect(useReading.getState().cards.map(c => c.ten)).toEqual(['Karma']));
    // Người dùng xoá trải bài, rời màn rồi quay lại cùng link → không nạp lại đè lên
    act(() => useReading.getState().clear());
    v.unmount();
    renderAt('/trai-bai' + hash);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(useReading.getState().cards).toHaveLength(0);
  });

  it('a bad #r=garbage link silently does nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderAt('/trai-bai#r=garbage');
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(useReading.getState()).toMatchObject({ cards: [], question: '', answer: '', spreadKey: 'free' });
    expect(useInterpret.getState().share).toBe(false);
    expect(document.querySelector('.shared-note')).toBeNull();
    expect($('aiOutput').classList.contains('ai-hint')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('Review Focus 2: a hostile id:-1 card renders its name as text and never gets a foreign image', async () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    const data: ShareData = {
      q: '<b>q</b>', d: 'Evil', p: 'free', a: '<script>window.__pwned=1</script>ok',
      c: [[-1, 1, evil, 'javascript:alert(1)', '<i>bo</i>', '1', 'Evil'], [-1, 0, 'Ext', 'https://evil.example/a.png', 'b', '2', R]],
    };
    renderAt('/trai-bai#r=' + (await encodeShare(data)));
    await waitFor(() => expect(useReading.getState().cards).toHaveLength(2));
    const [a, b] = useReading.getState().cards as [SpreadCard, SpreadCard];
    expect(a).toMatchObject({ id: -1, ten: evil, image_url: '', deck: '', orientation: 'nguoc' });
    expect(b).toMatchObject({ ten: 'Ext', image_url: '', deck: R });
    expect(useApp.getState().deck).toBe(W); // 'Evil' không phải bộ an toàn → không đổi bộ
    await waitFor(() => expect(document.body.textContent).toContain(evil));
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('#aiOutput b, #aiOutput i')).toBeNull();
    expect([...document.querySelectorAll('img')].some(i => /evil|javascript/.test(i.getAttribute('src') || ''))).toBe(false);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe('loadReading (History record)', () => {
  it('switches to a single known deck, keeps the spread when the record has none, attaches the record for notes', async () => {
    useReading.setState({ spreadKey: 'ppf' });
    renderAt();
    const rec: ReadingRecord = {
      id: 7, ts: 1, deck: R, question: 'Hỏi', provider: 'x', text: 'Đáp', note: 'ghi chú',
      cards: [{ ...fixture(R, 'The Devil'), orientation: 'nguoc' }],
    };
    act(() => loadReading(rec));
    const s = useReading.getState();
    expect(useApp.getState().deck).toBe(R);
    expect(s.spreadKey).toBe('ppf');
    expect(s.cards[0]).toMatchObject({ ten: 'The Devil', orientation: 'nguoc' });
    expect(typeof s.cards[0]!.uid).toBe('number');
    expect(s.current?.id).toBe(7);
    expect($('readingNoteWrap').style.display).toBe('block');
    expect($<HTMLTextAreaElement>('readingNote').value).toBe('ghi chú');
    expect(document.querySelector('.shared-note')).toBeNull();
  });
  it('a multi-deck or unknown deck does not switch; a known spread is restored; no text → background off', () => {
    act(() => loadReading({ deck: `${W}, ${R}`, question: '', text: '', spread: 'one', cards: [{ ...fixture(R, 'The Fool'), orientation: 'xuoi' }] }));
    expect(useApp.getState().deck).toBe(W);
    expect(useReading.getState()).toMatchObject({ spreadKey: 'one', aiBg: 'off', current: null });
  });
});

describe('share link button', () => {
  it('copies origin + "/#r=" + encodeShare(buildShareData(...)), shows "✅ Đã copy link" for 2 s; legacy opens it', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const cards = [card('The Fool'), card('The Tower', 'nguoc'), { ...card('Ace of Cups'), id: -1, ten: 'Lá riêng', deck: R }];
    useReading.setState({ question: '  Hỏi gì?  ', spreadKey: 'ppf', cards, answer: 'Lời giải' });
    useInterpret.setState({ share: true });
    renderAt();
    const btn = $('shareLinkBtn');
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const code = await encodeShare(buildShareData({ question: '  Hỏi gì?  ', fallbackDeck: W, spreadKey: 'ppf', answer: 'Lời giải', cards }));
    const url = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(url).toBe(location.origin + '/#r=' + code);
    expect(btn.textContent).toBe('✅ Đã copy link');
    await act(async () => { await new Promise(r => setTimeout(r, 2050)); });
    expect(btn.textContent).toBe('🔗 Link');
    // link do bản mới tạo → bản cũ mở được, cùng lá/chiều/câu hỏi/lời giải
    (open.ctx.location as { hash: string }).hash = url.slice(url.indexOf('#'));
    expect(await open.fns.loadSharedFromHash()).toBe(true);
    const it0 = JSON.parse(JSON.stringify(legacyLoaded[0])) as { question: string; text: string; spread: string; cards: { id: number | null; ten: string; orientation: string; deck: string }[] };
    expect(it0).toMatchObject({ question: 'Hỏi gì?', text: 'Lời giải', spread: 'ppf' });
    expect(it0.cards.map(c => [c.id, c.ten, c.orientation, c.deck])).toEqual([
      [cards[0]!.id, 'The Fool', 'xuoi', W], [cards[1]!.id, 'The Tower', 'nguoc', W], [null, 'Lá riêng', 'xuoi', R],
    ]);
  }, 10000);
  it('falls back to prompt() when the clipboard is unavailable; does nothing without cards', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    useInterpret.setState({ share: true });
    renderAt();
    await act(async () => { fireEvent.click($('shareLinkBtn')); });
    expect(prompt).not.toHaveBeenCalled();
    act(() => useReading.setState({ cards: [card('Karma')] }));
    await act(async () => { fireEvent.click($('shareLinkBtn')); });
    await waitFor(() => expect(prompt).toHaveBeenCalledWith('Sao chép link chia sẻ:', expect.stringMatching(/^http.*\/#r=[01]/)));
    expect($('shareLinkBtn').textContent).toBe('🔗 Link');
  });
  it('uses the share sheet on touch devices', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }));
    useReading.setState({ cards: [card('Karma')] });
    useInterpret.setState({ share: true });
    renderAt();
    await act(async () => { fireEvent.click($('shareLinkBtn')); });
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Witches Tarot', text: 'Trải bài Tarot của tôi', url: expect.stringContaining('/#r=') }));
  });
  it('cancelling the share sheet (AbortError) does nothing; any other share error falls back to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    let err: Error = new DOMException('cancel', 'AbortError');
    const share = vi.fn(async () => { throw err; });
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }));
    useReading.setState({ cards: [card('Karma')] });
    useInterpret.setState({ share: true });
    renderAt();
    await act(async () => { fireEvent.click($('shareLinkBtn')); });
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(writeText).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    expect($('shareLinkBtn').textContent).toBe('🔗 Link');
    err = new Error('NotAllowedError');
    await act(async () => { fireEvent.click($('shareLinkBtn')); });
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('share image', () => {
  let blobOk = true;
  const images: string[] = [];
  let downloads: string[] = [];
  beforeEach(() => {
    blobOk = true;
    images.length = 0;
    downloads = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
        if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (k in t) return t[k];
        return () => {};
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      setTimeout(() => cb(blobOk ? new Blob(['png'], { type: 'image/png' }) : null), 0);
    });
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';
      set src(v: string) { images.push(v); setTimeout(() => this.onload?.(), 0); }
    }
    vi.stubGlobal('Image', FakeImage);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  });

  it('draws via the tarot.vn proxy, calls toBlob and downloads "witches-tarot-<dailyKey>.png"; button shows "⏳ Đang tạo…"', async () => {
    const ext = { ...card('Karma'), id: -1, image_url: 'https://evil.example/a.png' };
    useReading.setState({ question: 'Q', spreadKey: 'ppf', cards: [card('The Fool'), card('The Tower', 'nguoc'), ext], answer: '**A** b' });
    useInterpret.setState({ share: true });
    renderAt();
    const btn = $<HTMLButtonElement>('shareImgBtn');
    act(() => { fireEvent.click(btn); });
    expect(btn.textContent).toBe('⏳ Đang tạo…');
    expect(btn.disabled).toBe(true);
    await waitFor(() => expect(downloads).toEqual(['witches-tarot-' + dailyKey() + '.png']));
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(images).toEqual([fixture(W, 'The Fool').image_url, fixture(W, 'The Tower').image_url].map(u => '/api/img?u=' + encodeURIComponent(String(u))));
    await waitFor(() => expect(btn.textContent).toBe('📸 Tải ảnh'));
    expect(btn.disabled).toBe(false);
  });
  it('touch: cancelling the share sheet (AbortError) does not download; other share errors still download', async () => {
    let err: Error = new DOMException('cancel', 'AbortError');
    const share = vi.fn(async () => { throw err; });
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    useReading.setState({ question: 'Q', cards: [card('The Fool')] });
    await exportReadingImage();
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'Witches Tarot', text: 'Q' });
    expect(downloads).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    err = new Error('boom');
    await exportReadingImage();
    expect(downloads).toEqual(['witches-tarot-' + dailyKey() + '.png']);
  });
  it('alerts on failure', async () => {
    blobOk = false;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    useReading.setState({ cards: [card('The Fool')] });
    await exportReadingImage();
    expect(alert).toHaveBeenCalledWith('Không xuất được ảnh: Không tạo được ảnh');
    expect(downloads).toEqual([]);
  });
});
