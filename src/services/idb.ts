// Nhật ký trải bài trong IndexedDB. Tên DB, version và store GIỮ NGUYÊN như bản cũ để đọc được lịch sử của người dùng cũ.
// Store "decks" cũ (tính năng nhập bộ bài đã bỏ) chỉ còn để dọn.
import type { Reading } from '../core/types';

const DB_NAME = 'witchesTarotDecks';
const DB_VERSION = 2;
const READINGS = 'readings';
const OLD_DECKS = 'decks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(OLD_DECKS)) d.createObjectStore(OLD_DECKS, { keyPath: 'deck' });
      if (!d.objectStoreNames.contains(READINGS)) d.createObjectStore(READINGS, { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Chạy một thao tác trong transaction; resolve khi transaction hoàn tất, rồi đóng kết nối. */
async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest | void,
  pick?: (req: IDBRequest) => T,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = run(t.objectStore(store));
      t.oncomplete = () => resolve(pick && req ? pick(req) : (undefined as T));
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Thêm một lượt trải bài; gán và trả về id mới. */
export async function addReading(reading: Reading): Promise<number> {
  const id = await tx(READINGS, 'readwrite', s => s.add(reading), req => req.result as number);
  reading.id = id;
  return id;
}

export function updateReading(reading: Reading): Promise<void> {
  return tx(READINGS, 'readwrite', s => s.put(reading));
}

export function allReadings(): Promise<Reading[]> {
  return tx(READINGS, 'readonly', s => s.getAll(), req => (req.result as Reading[]) || []);
}

export function deleteReading(id: number): Promise<void> {
  return tx(READINGS, 'readwrite', s => s.delete(id));
}

export function clearReadings(): Promise<void> {
  return tx(READINGS, 'readwrite', s => s.clear());
}

/** Xoá dữ liệu của tính năng nhập bộ bài đã bỏ (nếu còn). Không bao giờ ném lỗi. */
export async function clearOldDecks(): Promise<void> {
  try {
    await tx(OLD_DECKS, 'readwrite', s => s.clear());
  } catch {
    /* bỏ qua */
  }
}
