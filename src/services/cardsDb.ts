// Dữ liệu bộ bài: tarot.db (SQLite) chạy ngay trong trình duyệt bằng sql.js (WASM).
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { romanToInt } from '../core/cards';
import type { Card } from '../core/types';

/** Cột được tìm khi gõ vào ô tìm kiếm (giữ như bản cũ). */
export const SEARCH_COLS = ['so', 'ten', 'bo', 'tu_khoa', 'mo_ta_hinh_anh', 'y_nghia_xuoi', 'nghia_nguoc', 'content'] as const;

export interface CardQuery {
  /** null = mọi bộ */
  deck: string | null;
  /** chất bài ('Bo Wands'…); 'all' hoặc bỏ trống = mọi chất */
  category?: string;
  text?: string;
  limit?: number;
}

export interface CardsDb {
  query(o: CardQuery): Card[];
  /** Các bộ bài có trong DB, Witches Tarot trước. */
  decks(): string[];
  /** Tên lá Ẩn Chính số n của một bộ (vd. Rider-Waite 15 = "The Devil"); null nếu không có. */
  majorNameIn(deck: string, n: number): string | null;
  byId(id: number): Card | null;
}

function rows(db: Database, sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  const st = db.prepare(sql);
  try {
    st.bind(params);
    const out: Record<string, SqlValue>[] = [];
    while (st.step()) out.push(st.getAsObject());
    return out;
  } finally {
    st.free();
  }
}

export function openCardsDb(bytes: Uint8Array, SQL: SqlJsStatic): CardsDb {
  const db = new SQL.Database(bytes);
  return {
    query({ deck, category, text, limit }) {
      const clauses: string[] = [];
      const params: SqlValue[] = [];
      if (deck) {
        clauses.push('deck = ?');
        params.push(deck);
      }
      if (category && category !== 'all') {
        clauses.push('bo = ?');
        params.push(category);
      }
      if (text) {
        clauses.push('(' + SEARCH_COLS.map(c => c + ' LIKE ?').join(' OR ') + ')');
        for (let i = 0; i < SEARCH_COLS.length; i++) params.push('%' + text + '%');
      }
      let sql = 'SELECT * FROM cards';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      sql += ' ORDER BY id';
      if (limit) sql += ' LIMIT ' + Math.floor(Number(limit));
      return rows(db, sql, params) as unknown as Card[];
    },
    decks() {
      return rows(db, "SELECT deck FROM cards GROUP BY deck ORDER BY (deck='Witches Tarot') DESC, deck").map(r => String(r.deck));
    },
    majorNameIn(deck, n) {
      for (const r of rows(db, "SELECT ten, so FROM cards WHERE deck = ? AND bo = 'Bo An Chinh'", [deck])) {
        if (romanToInt(String(r.so ?? '')) === n) return String(r.ten);
      }
      return null;
    },
    byId(id) {
      return (rows(db, 'SELECT * FROM cards WHERE id = ?', [id])[0] as unknown as Card | undefined) ?? null;
    },
  };
}

/** Tải tarot.db và khởi động sql.js (WASM lấy từ gói npm, không từ CDN). */
export async function loadCardsDb(url = '/tarot.db'): Promise<CardsDb> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const [SQL, res] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), fetch(url)]);
  if (!res.ok) throw new Error('tarot.db HTTP ' + res.status);
  return openCardsDb(new Uint8Array(await res.arrayBuffer()), SQL);
}
