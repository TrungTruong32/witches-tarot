// Khởi động: nạp tarot.db → khôi phục bộ bài → dọn dữ liệu cũ → hẹn giờ đồng bộ lịch sử. Theo thứ tự boot() của bản cũ.
import type { CardEnMap } from '../core/types';
import { loadCardsDb, type CardsDb } from '../services/cardsDb';
import { clearOldDecks } from '../services/idb';
import { cloudBackfill } from '../services/readingsApi';
import { getStr, KEYS } from '../services/storage';
import { useApp } from './store';

export interface BootDeps {
  loadDb?: () => Promise<CardsDb>;
  /** Mặc định: đồng bộ lịch sử cũ sau 2,5 giây (như bản cũ), để không tranh băng thông lúc mở app. */
  scheduleBackfill?: () => void;
}

const fetchCardEn = async (): Promise<CardEnMap> => {
  const r = await fetch('/card_en.json');
  if (!r.ok) throw new Error('card_en.json HTTP ' + r.status);
  return (await r.json()) as CardEnMap;
};

let cardEnInFlight: Promise<void> | null = null;

/** Gọi load ngay (đồng bộ); lỗi ném đồng bộ cũng thành promise bị từ chối, không làm hỏng setLang. */
function startLoad(load: () => Promise<CardEnMap>): Promise<CardEnMap> {
  try {
    return load();
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Nạp nghĩa tiếng Anh (chỉ cần khi giao diện là EN); lỗi thì giữ nghĩa tiếng Việt và lần sau thử lại.
 *  Nhiều lần gọi cùng lúc dùng chung một lượt tải (như cờ cardEnLoading của bản cũ). */
export function ensureCardEn(load: () => Promise<CardEnMap> = fetchCardEn): Promise<void> {
  if (useApp.getState().cardEn) return Promise.resolve();
  cardEnInFlight ??= startLoad(load)
    .then(cardEn => useApp.setState({ cardEn }), () => { /* không có bản dịch thì hiện nghĩa gốc */ })
    .finally(() => { cardEnInFlight = null; });
  return cardEnInFlight;
}

/** Nạp nghĩa EN ngay khi app mở bằng tiếng Anh (song song với tarot.db) và mỗi lần ngôn ngữ chuyển sang EN,
 *  dù nút nào đổi ngôn ngữ. Gọi một lần khi khởi động; trả về hàm huỷ theo dõi. */
export function watchLangForCardEn(load: () => Promise<CardEnMap> = fetchCardEn): () => void {
  if (useApp.getState().lang === 'en') void ensureCardEn(load);
  return useApp.subscribe((s, prev) => {
    if (s.lang === 'en' && prev.lang !== 'en') void ensureCardEn(load);
  });
}

export async function boot(deps: BootDeps = {}): Promise<void> {
  const { loadDb = () => loadCardsDb(), scheduleBackfill = () => setTimeout(() => void cloudBackfill(useApp.getState().lang), 2500) } = deps;
  let db: CardsDb;
  try {
    db = await loadDb();
  } catch (err) {
    console.error(err);
    useApp.setState({ dbStatus: 'error', dbError: 'Không thể tải cơ sở dữ liệu: ' + (err instanceof Error ? err.message : String(err)) });
    return;
  }
  void clearOldDecks();
  const decks = db.decks();
  const saved = getStr(KEYS.deck, '');
  const deck = decks.includes(saved) ? saved : decks[0] ?? null;
  useApp.setState({ db, decks, deck, dbStatus: 'ready', dbError: '' });
  scheduleBackfill();
}
