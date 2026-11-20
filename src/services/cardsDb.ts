// Dữ liệu bộ bài: tarot.db (SQLite) chạy ngay trong trình duyệt bằng sql.js (WASM).
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
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
  /** Số lá theo từng chất của một bộ, theo thứ tự xuất hiện (cho các ô chất bài ở Tra cứu). */
  suits(deck: string): { bo: string; c: number }[];
  /** Tổng số lá của một bộ. */
  count(deck: string): number;
  /** Ba lá đầu của một chất (ảnh minh hoạ ô chất bài). */
  topCards(deck: string, bo: string): { ten: string; image_url: string | null }[];
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
    suits(deck) {
      return rows(db, 'SELECT bo, COUNT(*) c FROM cards WHERE deck = ? GROUP BY bo ORDER BY MIN(id)', [deck]) as unknown as { bo: string; c: number }[];
    },
    count(deck) {
      return Number(rows(db, 'SELECT COUNT(*) c FROM cards WHERE deck = ?', [deck])[0]?.c ?? 0);
    },
    topCards(deck, bo) {
      return rows(db, 'SELECT ten, image_url FROM cards WHERE deck = ? AND bo = ? ORDER BY id LIMIT 3', [deck, bo]) as unknown as {
        ten: string;
        image_url: string | null;
      }[];
    },
  };
}

// ---- Tải sớm (startCardsDbDownload) ----
// Ba thứ cần cho DB: chunk sql.js, file wasm (URL có hash, nhập tĩnh chỉ là một chuỗi) và tarot.db.
// Trước đây tarot.db chỉ bắt đầu tải sau khi chunk sql.js về, và wasm sau khi sql.js khởi động → thác nước nhiều chặng.
// Giờ cả ba bắt đầu cùng lúc, ngay khi module vào (src/app/earlyDb.ts), và loadCardsDb dùng lại đúng các lượt tải đó.
const importSqlJs = () => import('sql.js');
interface Started {
  url: string;
  mod: ReturnType<typeof importSqlJs>;
  res: Promise<Response>;
}
let started: Started | null = null;

/** Gắn <link rel=preload> cho wasm: sql.js tự fetch wasm với credentials 'same-origin', mode cors (mặc định của fetch)
 *  → preload phải là as="fetch" + crossorigin (anonymous = same-origin) mới khớp, không thì wasm bị tải hai lần. */
function preloadWasm(doc: Document): void {
  if (doc.querySelector(`link[rel="preload"][href="${wasmUrl}"]`)) return;
  const l = doc.createElement('link');
  l.rel = 'preload';
  l.setAttribute('as', 'fetch');
  l.setAttribute('crossorigin', 'anonymous');
  l.href = wasmUrl;
  doc.head.appendChild(l);
}

/** Bắt đầu tải chunk sql.js + wasm + tarot.db ngay (idempotent). Lỗi mạng để loadCardsDb báo như cũ. */
export function startCardsDbDownload(url = '/tarot.db', doc: Document = document): void {
  if (started) return;
  preloadWasm(doc);
  const res = fetch(url);
  const mod = importSqlJs();
  // chưa ai chờ → nuốt lỗi ở đây để offline không hiện "unhandled rejection"; loadCardsDb vẫn nhận lỗi qua promise gốc
  res.catch(() => {});
  mod.catch(() => {});
  started = { url, mod, res };
}

/** Lấy lượt tải đã bắt đầu (một lần) — lần nạp sau (vd. thử lại) tự tải mới. */
function takeStarted(url: string): Started | null {
  const s = started && started.url === url ? started : null;
  if (s) started = null;
  return s;
}

/** Tải tarot.db và khởi động sql.js (WASM lấy từ gói npm, không từ CDN). */
export async function loadCardsDb(url = '/tarot.db'): Promise<CardsDb> {
  // tarot.db tải song song với chunk sql.js (không chờ chunk về mới fetch)
  const s = takeStarted(url) ?? { url, mod: importSqlJs(), res: fetch(url) };
  s.res.catch(() => {}); // lỗi được ném lại ở `await s.res` bên dưới, sau khi sql.js đã khởi động
  const { default: initSqlJs } = await s.mod;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const res = await s.res;
  if (!res.ok) throw new Error('HTTP ' + res.status + ' khi tải tarot.db'); // đúng thông báo của bản cũ
  return openCardsDb(new Uint8Array(await res.arrayBuffer()), SQL);
}

/** Chỉ cho test: quên lượt tải sớm. */
export function resetCardsDbDownload(): void {
  started = null;
}
