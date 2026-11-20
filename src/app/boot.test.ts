import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../tests/fixtures/makeDb';
import { openCardsDb } from '../services/cardsDb';
import { boot } from './boot';
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
  it('schedules the cloud backfill once the DB is ready, and loads card_en.json in English', async () => {
    localStorage.setItem('tarotLang', 'en');
    useApp.setState(initialState());
    const scheduleBackfill = vi.fn();
    const loadCardEn = vi.fn(async () => ({ 1: { kw: 'k', up: 'u', rev: 'r' } }));
    await boot({ loadDb: loader, scheduleBackfill, loadCardEn });
    expect(scheduleBackfill).toHaveBeenCalledOnce();
    expect(loadCardEn).toHaveBeenCalledOnce();
    expect(useApp.getState().cardEn).toEqual({ 1: { kw: 'k', up: 'u', rev: 'r' } });
  });
});
