import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../tests/fixtures/makeDb';
import { openCardsDb } from '../services/cardsDb';
import { boot, watchLangForCardEn } from './boot';
import { initialState, useApp } from './store';

const loader = async () => openCardsDb(await makeDb(deckCards), await sqlJs());

beforeEach(() => {
  localStorage.clear();
  useApp.setState(initialState());
  vi.useRealTimers();
});

describe('boot', () => {
  it('DB failure → error status with the legacy message', async () => {
    await boot({ loadDb: () => Promise.reject(new Error('HTTP 404 khi tải tarot.db')), scheduleBackfill: () => {} });
    const s = useApp.getState();
    expect(s.dbStatus).toBe('error');
    expect(s.dbError).toBe('Không thể tải cơ sở dữ liệu: HTTP 404 khi tải tarot.db');
    expect(s.db).toBeNull();
  });
  it('restores a valid saved deck', async () => {
    localStorage.setItem('witchesTarotDeck', 'Rider-Waite');
    await boot({ loadDb: loader, scheduleBackfill: () => {} });
    const s = useApp.getState();
    expect(s.dbStatus).toBe('ready');
    expect(s.decks).toEqual(['Witches Tarot', 'Rider-Waite']);
    expect(s.deck).toBe('Rider-Waite');
  });
  it('falls back to the first deck when the saved one is unknown', async () => {
    localStorage.setItem('witchesTarotDeck', 'Gone Deck');
    await boot({ loadDb: loader, scheduleBackfill: () => {} });
    expect(useApp.getState().deck).toBe('Witches Tarot');
  });
  it('schedules the cloud backfill once the DB is ready', async () => {
    const scheduleBackfill = vi.fn();
    await boot({ loadDb: loader, scheduleBackfill });
    expect(scheduleBackfill).toHaveBeenCalledOnce();
  });
});

describe('English card meanings (card_en.json)', () => {
  const EN = { 1: { kw: 'k', up: 'u', rev: 'r' } };
  it('start in English → loads at once, without waiting for the DB', async () => {
    localStorage.setItem('tarotLang', 'en');
    useApp.setState(initialState());
    const load = vi.fn(async () => EN);
    const off = watchLangForCardEn(load);
    await vi.waitFor(() => expect(useApp.getState().cardEn).toEqual(EN));
    expect(useApp.getState().db).toBeNull();
    off();
  });
  it('any switch to English loads it, once, even when toggled quickly', async () => {
    let resolve!: (m: typeof EN) => void;
    const load = vi.fn(() => new Promise<typeof EN>(r => { resolve = r; }));
    const off = watchLangForCardEn(load);
    expect(load).not.toHaveBeenCalled();
    const { setLang } = useApp.getState();
    setLang('en'); setLang('vi'); setLang('en');
    expect(load).toHaveBeenCalledOnce();
    resolve(EN);
    await vi.waitFor(() => expect(useApp.getState().cardEn).toEqual(EN));
    setLang('vi'); setLang('en');
    expect(load).toHaveBeenCalledOnce();
    off();
  });
  it('a failed download can be retried on the next switch', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(EN);
    const off = watchLangForCardEn(load);
    const { setLang } = useApp.getState();
    setLang('en');
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    await new Promise(r => setTimeout(r, 0));
    setLang('vi'); setLang('en');
    await vi.waitFor(() => expect(useApp.getState().cardEn).toEqual(EN));
    off();
  });
});
