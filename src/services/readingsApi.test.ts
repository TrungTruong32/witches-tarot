import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fakeFetch } from '../../tests/helpers/stream';
import type { Reading } from '../core/types';
import { addReading } from './idb';
import { cloudBackfill, cloudPayload, cloudSaveReading } from './readingsApi';

const { fns: L, ctx: lctx } = loadLegacyWithContext<{ cloudPayload(r: Reading): unknown }>(['cloudPayload'], { lang: 'vi' });

const reading = (o: Partial<Reading> = {}): Reading => ({
  ts: 1731900000000, deck: 'Witches Tarot', question: 'Hỏi?', provider: 'free · gemini', text: 'đáp', followups: [{ q: 'a', a: 'b' }], note: 'riêng tư',
  spread: 'ppf', positions: ['Quá khứ', 'Hiện tại', 'Tương lai'], facts: ['Lá ngược: 1/3'],
  cards: [0, 1, 2].map(i => ({ id: i + 1, deck: 'Witches Tarot', ten: 'L' + i, bo: 'Bo Cups', so: String(i + 2), y_nghia_xuoi: 'x', nghia_nguoc: 'y', tu_khoa: 'k', image_url: 'i', orientation: i ? 'xuoi' : 'nguoc' })),
  ...o,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tarotDeviceId', '0f8fad5b-d9cb-469f-a165-70867728950e');
  globalThis.indexedDB = new IDBFactory();
});

describe('cloudPayload matches legacy', () => {
  for (const lang of ['vi', 'en'] as const) {
    it(`with positions (${lang})`, () => {
      lctx.lang = lang;
      expect(cloudPayload(reading(), lang)).toEqual(JSON.parse(JSON.stringify(L.cloudPayload(reading()))));
    });
    it(`without positions/spread/facts, numeric so (${lang})`, () => {
      lctx.lang = lang;
      const r = reading({ positions: null, spread: undefined, facts: undefined });
      expect(cloudPayload(r, lang)).toEqual(JSON.parse(JSON.stringify(L.cloudPayload(r))));
    });
  }
  it('never sends the private note or the follow-up chat', () => {
    const p = JSON.stringify(cloudPayload(reading(), 'vi'));
    expect(p).not.toContain('riêng tư');
    expect(p).not.toContain('followups');
  });
});

describe('cloudSaveReading', () => {
  it('POSTs device_id + payload with keepalive', () => {
    const ff = fakeFetch(() => new Response(null, { status: 201 }));
    cloudSaveReading(reading(), 'vi', ff.fetch);
    expect(ff.calls).toHaveLength(1);
    expect(ff.calls[0]!.url).toBe('/api/readings');
    expect(ff.calls[0]!.init.keepalive).toBe(true);
    expect(ff.calls[0]!.body).toMatchObject({ device_id: '0f8fad5b-d9cb-469f-a165-70867728950e', question: 'Hỏi?' });
  });
  it('does nothing when the user turned cloud save off, or when there are no cards', () => {
    const ff = fakeFetch(() => new Response(null));
    localStorage.setItem('tarotCloudSave', '0');
    cloudSaveReading(reading(), 'vi', ff.fetch);
    localStorage.removeItem('tarotCloudSave');
    cloudSaveReading(reading({ cards: [] }), 'vi', ff.fetch);
    expect(ff.calls).toHaveLength(0);
  });
});

describe('cloudBackfill', () => {
  const seed = async (n: number) => {
    for (let i = 0; i < n; i++) await addReading(reading({ ts: 1731900000000 + i }));
  };

  it('skips imported and card-less records, sends 30 readings in 2 batches, then marks done', async () => {
    await seed(30);
    await addReading(reading({ ts: 1, imported: true }));
    await addReading(reading({ ts: 2, cards: [] }));
    const ff = fakeFetch(() => new Response(null, { status: 200 }));
    await cloudBackfill('vi', ff.fetch);
    const sizes = ff.calls.map(c => (c.body as { batch: unknown[] }).batch.length);
    expect(sizes).toEqual([25, 5]);
    const sent = ff.calls.flatMap(c => (c.body as { batch: { client_ts: number }[] }).batch.map(b => b.client_ts));
    expect(sent).not.toContain(1);
    expect(sent).not.toContain(2);
    expect(sent).toEqual([...sent].sort((a, b) => a - b));
    expect(localStorage.getItem('tarotCloudBackfill')).toBe('done');
  });

  it('410 stops and marks done; 400 skips a batch; 503 leaves it for next time', async () => {
    await seed(30);
    const gone = fakeFetch(() => new Response(null, { status: 410 }));
    await cloudBackfill('vi', gone.fetch);
    expect(gone.calls).toHaveLength(1);
    expect(localStorage.getItem('tarotCloudBackfill')).toBe('done');

    localStorage.removeItem('tarotCloudBackfill');
    let n = 0;
    const bad = fakeFetch(() => new Response(null, { status: n++ === 0 ? 400 : 200 }));
    await cloudBackfill('vi', bad.fetch);
    expect(bad.calls).toHaveLength(2);
    expect(localStorage.getItem('tarotCloudBackfill')).toBe('done');

    localStorage.removeItem('tarotCloudBackfill');
    const busy = fakeFetch(() => new Response(null, { status: 503 }));
    await cloudBackfill('vi', busy.fetch);
    expect(busy.calls).toHaveLength(1);
    expect(localStorage.getItem('tarotCloudBackfill')).toBeNull();
  });

  it('does nothing when cloud save is off or backfill already done; empty journal marks done', async () => {
    await seed(3);
    const ff = fakeFetch(() => new Response(null));
    localStorage.setItem('tarotCloudSave', '0');
    await cloudBackfill('vi', ff.fetch);
    localStorage.removeItem('tarotCloudSave');
    localStorage.setItem('tarotCloudBackfill', 'done');
    await cloudBackfill('vi', ff.fetch);
    expect(ff.calls).toHaveLength(0);

    globalThis.indexedDB = new IDBFactory();
    localStorage.removeItem('tarotCloudBackfill');
    await cloudBackfill('vi', ff.fetch);
    expect(ff.calls).toHaveLength(0);
    expect(localStorage.getItem('tarotCloudBackfill')).toBe('done');
  });
});
