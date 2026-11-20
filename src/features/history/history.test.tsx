import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, useApp } from '../../app/store';
import type { Reading } from '../../core/types';
import { addReading, allReadings } from '../../services/idb';
import { initialInterpret, useInterpret } from '../reading/interpret';
import { initialReading, useReading } from '../reading/readingStore';
import { History } from './History';

vi.mock('../../services/readingsApi', () => ({ cloudSaveReading: vi.fn() }));
import { cloudSaveReading } from '../../services/readingsApi';

const card = (ten: string, orientation: 'xuoi' | 'nguoc' = 'xuoi') =>
  ({ id: 1, deck: 'Witches Tarot', ten, bo: 'Ẩn Chính', so: '0', y_nghia_xuoi: '', nghia_nguoc: '', tu_khoa: '', image_url: '', orientation }) as Reading['cards'][number];
const rec = (ts: number, question: string, ten: string, extra: Partial<Reading> = {}): Reading =>
  ({ ts, deck: 'Witches Tarot', question, provider: 'free · m', text: 'Lời giải **đậm**', cards: [card(ten)], spread: 'free', positions: null, facts: [], followups: [], ...extra });

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const renderHist = () => render(
  <MemoryRouter initialEntries={['/nhat-ky']}>
    <Routes>
      <Route path="/nhat-ky" element={<History />} />
      <Route path="/trai-bai" element={<div id="readingStub" />} />
    </Routes>
  </MemoryRouter>,
);
const blobText = (b: Blob) => new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(b); });
const questions = () => Array.from(document.querySelectorAll('.hist-item .q')).map(e => e.textContent);

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  useApp.setState({ ...initialState(), decks: ['Witches Tarot'], deck: 'Witches Tarot', dbStatus: 'ready' });
  useReading.setState(initialReading());
  useInterpret.setState(initialInterpret());
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function seed() {
  await addReading(rec(1000, 'Cũ nhất', 'The Fool'));
  await addReading(rec(3000, 'Mới nhất', 'The Tower', { note: 'ghi chú dài' }));
  await addReading(rec(2000, 'Ở giữa', 'The Star', { positions: ['Quá khứ'], facts: ['Lá tinh hoa: 1'], followups: [{ q: 'Hỏi thêm?', a: 'Trả lời' }] }));
}

describe('History render', () => {
  it('lists newest first with the legacy .hist-item structure', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    expect(questions()).toEqual(['Mới nhất', 'Ở giữa', 'Cũ nhất']);
    const first = document.querySelector('.hist-item')!;
    expect(first.querySelector('.row .info .time')!.textContent).toContain('Witches Tarot · AI miễn phí');
    expect(first.querySelector('.hist-note-preview')!.textContent).toBe('📝 ghi chú dài');
    expect(Array.from(first.querySelectorAll('.hist-actions button')).map(b => b.textContent)).toEqual(['Xem', 'Tải lại', '✕']);
    expect(first.querySelector('.hist-detail')!.classList.contains('open')).toBe(false);
    fireEvent.click(first.querySelector('.hist-actions button')!);
    expect(first.querySelector('.hist-detail')!.classList.contains('open')).toBe(true);
    expect(first.querySelector('.hist-actions button')!.textContent).toBe('Ẩn');
    expect(first.querySelector('.ai-output strong')!.textContent).toBe('đậm');
    const mid = document.querySelectorAll('.hist-item')[1]!;
    expect(mid.querySelector('.hist-cards')!.innerHTML).toContain('<em>Quá khứ</em>');
    expect(mid.querySelector('.facts-static .facts-body')!.textContent).toBe('• Lá tinh hoa: 1');
    expect(mid.querySelector('.chat-q')!.textContent).toBe('☌︎ Hỏi thêm?');
    expect($('clearHistory').style.display).toBe('');
  });

  it('renders a legacy record without followups, facts, positions or spread', async () => {
    await addReading({ ts: 5, deck: 'Witches Tarot', question: '', provider: '', text: 'x', cards: [card('The Fool')] } as Reading);
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(1));
    expect(document.querySelector('.hist-item .q')!.textContent).toBe('(không có câu hỏi)');
    expect(document.querySelector('.hist-cards')!.textContent).toBe('• The Fool — Xuôi');
  });

  it('shows the empty message and hides the clear button', async () => {
    renderHist();
    await waitFor(() => expect(document.querySelector('.hist-empty')).not.toBeNull());
    expect($('clearHistory').style.display).toBe('none');
  });

  it('filters by search after a 200 ms debounce', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change($('histSearch'), { target: { value: 'tower' } });
    act(() => { vi.advanceTimersByTime(199); });
    expect(document.querySelectorAll('.hist-item')).toHaveLength(3);
    act(() => { vi.advanceTimersByTime(1); });
    expect(questions()).toEqual(['Mới nhất']);
    fireEvent.change($('histSearch'), { target: { value: 'zzz' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelector('.hist-empty')!.textContent).toBe('Không có lượt trải bài nào khớp từ khóa.');
  });
});

describe('History actions', () => {
  it('Reload loads the reading and navigates to /trai-bai', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    fireEvent.click(document.querySelectorAll('.hist-item')[0]!.querySelectorAll('.hist-actions button')[1]!);
    expect($('readingStub')).not.toBeNull();
    const s = useReading.getState();
    expect(s.question).toBe('Mới nhất');
    expect(s.cards.map(c => c.ten)).toEqual(['The Tower']);
    expect(s.current?.id).toBeDefined();
  });

  it('delete asks confirm, removes the record and forgets the current reading', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    const all = await allReadings();
    const target = all.find(r => r.question === 'Mới nhất')!;
    useReading.getState().setCurrent(target);
    const c = vi.fn(() => false);
    vi.stubGlobal('confirm', c);
    const del = () => document.querySelector('.hist-item .rm') as HTMLElement;
    fireEvent.click(del());
    expect(c).toHaveBeenCalledWith('Xóa lượt trải bài này?');
    expect(await allReadings()).toHaveLength(3);
    c.mockReturnValue(true);
    fireEvent.click(del());
    await waitFor(() => expect(questions()).toEqual(['Ở giữa', 'Cũ nhất']));
    expect(await allReadings()).toHaveLength(2);
    expect(useReading.getState().current).toBeNull();
  });

  it('clear all asks confirm, empties the store and resets current', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    useReading.getState().setCurrent((await allReadings())[0]!);
    vi.stubGlobal('confirm', vi.fn(() => true));
    fireEvent.click($('clearHistory'));
    await waitFor(() => expect(document.querySelector('.hist-empty')).not.toBeNull());
    expect(await allReadings()).toHaveLength(0);
    expect(useReading.getState().current).toBeNull();
    expect($('clearHistory').style.display).toBe('none');
  });

  it('saves the detail note through the debounce into IndexedDB', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    const ta = document.querySelector('.hist-item .hist-note textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('ghi chú dài');
    fireEvent.change(ta, { target: { value: 'mới' } });
    expect(document.querySelector('.hist-note .hint')!.textContent).toBe('Đang lưu…');
    await waitFor(() => expect(document.querySelector('.hist-note .hint')!.textContent).toBe('✓ Đã lưu'), { timeout: 2000 });
    expect((await allReadings()).find(r => r.question === 'Mới nhất')!.note).toBe('mới');
  });
});

describe('History import / export', () => {
  const file = (obj: unknown) => new File([JSON.stringify(obj)], 'j.json', { type: 'application/json' });

  it('imports one new record, skips the duplicate, marks imported and never syncs to cloud', async () => {
    await addReading(rec(1000, 'Trùng', 'The Fool'));
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(1));
    const alertFn = vi.fn();
    vi.stubGlobal('alert', alertFn);
    const data = { app: 'witches-tarot', kind: 'journal', version: 1, readings: [rec(1000, 'Trùng', 'The Fool'), rec(2000, 'Mới', 'The Star', { id: 99 })], dailyNotes: { '2026-1-5': 'hôm nay' } };
    fireEvent.change($('journalImportFile'), { target: { files: [file(data)] } });
    await waitFor(() => expect(alertFn).toHaveBeenCalled());
    expect(alertFn).toHaveBeenCalledWith('Đã nhập 1 lượt trải bài, bỏ qua 1 bản trùng/lỗi, 1 ghi chú hằng ngày.');
    const all = await allReadings();
    expect(all).toHaveLength(2);
    const added = all.find(r => r.question === 'Mới')!;
    expect(added.imported).toBe(true);
    expect(added.id).not.toBe(99);
    expect(localStorage.getItem('dailyNote:2026-1-5')).toBe('hôm nay');
    expect(cloudSaveReading).not.toHaveBeenCalled();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(2));
  });

  it('alerts on invalid JSON and on a non-journal file', async () => {
    renderHist();
    const alertFn = vi.fn();
    vi.stubGlobal('alert', alertFn);
    fireEvent.change($('journalImportFile'), { target: { files: [new File(['{x'], 'a.json')] } });
    await waitFor(() => expect(alertFn).toHaveBeenCalledWith('File không phải JSON hợp lệ.'));
    fireEvent.change($('journalImportFile'), { target: { files: [file({ nope: 1 })] } });
    await waitFor(() => expect(alertFn).toHaveBeenCalledWith('File này không phải bản sao lưu nhật ký Witches Tarot.'));
  });

  it('exports JSON (version 1) and Markdown through a download link', async () => {
    await seed();
    renderHist();
    await waitFor(() => expect(document.querySelectorAll('.hist-item')).toHaveLength(3));
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    fireEvent.click($('exportJson'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(names[0]).toMatch(/^tarot-journal-\d{8}-\d{4}\.json$/);
    const parsed = JSON.parse(await blobText(blobs[0]!));
    expect(parsed.version).toBe(1);
    expect(parsed.readings.map((r: Reading) => r.ts)).toEqual([1000, 2000, 3000]);
    fireEvent.click($('exportMd'));
    await waitFor(() => expect(blobs).toHaveLength(2));
    expect(names[1]).toMatch(/\.md$/);
    expect(await blobText(blobs[1]!)).toContain('# Nhật ký Tarot');
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });
});
