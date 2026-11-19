import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import type { Reading } from '../core/types';
import { addReading, allReadings, clearOldDecks, clearReadings, deleteReading, updateReading } from './idb';

type Legacy = { idbOpen(): Promise<IDBDatabase>; idbAddReading(r: object): Promise<number> };

beforeEach(() => {
  // mỗi test một "trình duyệt" mới
  globalThis.indexedDB = new IDBFactory();
});

const legacyShaped = {
  ts: 1731900000000, deck: 'Witches Tarot', question: 'Bản ghi cũ', provider: 'Gemini', text: 'lời giải', followups: [], note: '',
  cards: [{ id: 1, deck: 'Witches Tarot', ten: 'The Fool', bo: 'Bo An Chinh', so: '0', y_nghia_xuoi: 'x', nghia_nguoc: 'y', tu_khoa: 'k', image_url: 'i', orientation: 'xuoi' }],
};

describe('IndexedDB journal', () => {
  it('reads records written by the legacy app unchanged (no spread/positions/facts, imported flag)', async () => {
    const L = loadLegacy<Legacy>(['idbOpen', 'idbAddReading'], { indexedDB: globalThis.indexedDB });
    await L.idbAddReading({ ...legacyShaped });
    await L.idbAddReading({ ...legacyShaped, question: 'nhập từ file', imported: true });
    const all = await allReadings();
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual({ ...legacyShaped, id: 1 });
    expect(all[1]?.imported).toBe(true);
    expect(all[0]).not.toHaveProperty('spread');
  });

  it('add → update → all → delete → clear', async () => {
    const r: Reading = { ...(legacyShaped as Reading) };
    const id = await addReading(r);
    expect(r.id).toBe(id);
    await updateReading({ ...r, note: 'ghi chú' });
    expect((await allReadings())[0]?.note).toBe('ghi chú');
    const id2 = await addReading({ ...(legacyShaped as Reading) });
    await deleteReading(id);
    expect((await allReadings()).map(x => x.id)).toEqual([id2]);
    await clearReadings();
    expect(await allReadings()).toEqual([]);
  });

  it('opens the DB with the legacy name/version/stores, and the legacy app can read what we write', async () => {
    await addReading({ ...(legacyShaped as Reading) });
    await clearOldDecks();
    const L = loadLegacy<Legacy>(['idbOpen'], { indexedDB: globalThis.indexedDB });
    const db = await L.idbOpen();
    expect(db.name).toBe('witchesTarotDecks');
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual(['decks', 'readings']);
    const store = db.transaction('readings').objectStore('readings');
    expect(store.keyPath).toBe('id');
    expect(store.autoIncrement).toBe(true);
    db.close();
  });
});
