// Dựng một tarot.db GIẢ trong bộ nhớ, đúng lược đồ bảng `cards` của bản thật.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import type { Card } from '../../src/core/types';

export const CARD_COLUMNS = [
  'id', 'deck', 'bo', 'so', 'ten', 'url', 'mo_ta_hinh_anh', 'y_nghia_xuoi', 'tu_khoa', 'than_thanh',
  'chiem_tinh_hoc', 'cac_nguyen_to_lien_quan', 'nghia_nguoc', 'content', 'image_url',
] as const;

let SQL: SqlJsStatic | null = null;
export async function sqlJs(): Promise<SqlJsStatic> {
  return (SQL ??= await initSqlJs());
}

export async function makeDb(cards: Card[]): Promise<Uint8Array> {
  const S = await sqlJs();
  const db = new S.Database();
  db.run(`CREATE TABLE cards (id INTEGER PRIMARY KEY, ${CARD_COLUMNS.slice(1).map(c => c + ' TEXT').join(', ')})`);
  const st = db.prepare(`INSERT INTO cards (${CARD_COLUMNS.join(', ')}) VALUES (${CARD_COLUMNS.map(() => '?').join(', ')})`);
  for (const c of cards) st.run(CARD_COLUMNS.map(k => (c as unknown as Record<string, string | number | null | undefined>)[k] ?? null));
  st.free();
  const bytes = db.export();
  db.close();
  return bytes;
}
