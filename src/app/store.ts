// Trạng thái toàn app (Zustand). Phần cần nhớ được ghi qua services/storage với ĐÚNG key + định dạng của bản cũ.
import { create } from 'zustand';
import { normalizeCardBack } from '../core/cardBacks';
import type { CardEnMap, Lang } from '../core/types';
import type { CardsDb } from '../services/cardsDb';
import type { BeforeInstallPromptEvent } from './pwaInstall';
import { getStr, KEYS, loadAiSettings, remove, saveAiSettings as persistAi, setStr, type AiSettings } from '../services/storage';

export interface Prefs {
  /** '' = mặc định (tối); bản cũ áp nguyên chuỗi đã lưu vào html[data-theme] */
  theme: string;
  fx: 'on' | 'off';
  skyMode: string;
  skyCity: string;
  cardBack: string;
  /** true = bỏ qua nghi thức trước khi xào bài */
  ritualOff: boolean;
  soundOn: boolean;
  soundVol: number;
  ambientMode: string;
  ambientVol: number;
  cloudSave: boolean;
}

export type OverlayId = 'nav' | 'ai' | 'site';

/** Chỗ đang xem ở Tra cứu — giữ khi rời màn hình rồi quay lại (bản cũ chỉ ẩn view). Không lưu xuống storage. */
export interface BrowseState {
  /** Bộ bài lúc lưu; đổi bộ bài thì Tra cứu về "Tất cả" và xoá ô tìm như bản cũ. */
  deck: string | null;
  category: string;
  query: string;
  /** Lá người dùng bấm chọn, gắn với danh sách lúc chọn (`deck|category|query`). */
  picked: { key: string; id: number } | null;
}

export interface AppState {
  lang: Lang;
  prefs: Prefs;
  deck: string | null;
  decks: string[];
  db: CardsDb | null;
  dbStatus: 'loading' | 'ready' | 'error';
  dbError: string;
  cardEn: CardEnMap | null;
  aiSettings: AiSettings;
  overlay: OverlayId | null;
  lightbox: { url: string; reversed: boolean } | null;
  /** Lời mời cài PWA đã bắt được (xem pwaInstall.ts); null = không có nút Cài ứng dụng. */
  installPrompt: BeforeInstallPromptEvent | null;
  browse: BrowseState;
  /** Nghi thức trước khi xào đang mở (#ritualOverlay): câu hỏi để trích + việc chạy khi bấm Bắt đầu / Bỏ qua. */
  ritual: RitualRequest | null;
  setLang(l: Lang): void;
  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void;
  setDeck(d: string): void;
  saveAiSettings(s: AiSettings): void;
  openOverlay(o: OverlayId): void;
  closeOverlay(): void;
  openLightbox(url: string, reversed: boolean): void;
  closeLightbox(): void;
  setBrowse(p: Partial<BrowseState>): void;
  requestRitual(r: RitualRequest): void;
  closeRitual(): void;
}

export interface RitualRequest {
  question: string;
  start(): void;
}

const vol = (raw: string, fallback: number) => {
  const v = parseFloat(raw);
  return isNaN(v) ? fallback : Math.min(1, Math.max(0, v));
};

/** Đọc cài đặt trang theo đúng cách bản cũ khởi tạo từng key. */
export function loadPrefs(): Prefs {
  let ambientMode = getStr(KEYS.ambientMode, '');
  if (!ambientMode && getStr(KEYS.ambient, '') === '1') ambientMode = 'mystic'; // di trú từ bản cũ hơn
  return {
    theme: getStr(KEYS.theme, ''),
    fx: getStr(KEYS.fx, '') === '0' ? 'off' : 'on',
    skyMode: getStr(KEYS.skyMode, '') || 'deco',
    skyCity: getStr(KEYS.skyCity, '') || 'hanoi',
    cardBack: normalizeCardBack(getStr(KEYS.cardBack, '') || null),
    ritualOff: getStr(KEYS.ritual, '') === '0',
    soundOn: getStr(KEYS.sound, '') !== '0',
    soundVol: vol(getStr(KEYS.soundVol, ''), 0.7),
    ambientMode: ambientMode || 'off',
    ambientVol: vol(getStr(KEYS.ambientVol, ''), 0.5),
    cloudSave: getStr(KEYS.cloudSave, '') !== '0',
  };
}

/** Ghi một cài đặt xuống key cũ, đúng định dạng cũ. */
function persistPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  switch (k) {
    case 'theme': return setStr(KEYS.theme, String(v));
    case 'fx': return setStr(KEYS.fx, v === 'off' ? '0' : '1');
    case 'skyMode': return setStr(KEYS.skyMode, String(v));
    case 'skyCity': return setStr(KEYS.skyCity, String(v));
    case 'cardBack': return setStr(KEYS.cardBack, String(v));
    case 'ritualOff': return setStr(KEYS.ritual, v ? '0' : '1');
    case 'soundOn': return setStr(KEYS.sound, v ? '1' : '0');
    case 'soundVol': return setStr(KEYS.soundVol, String(v));
    case 'ambientMode': return setStr(KEYS.ambientMode, String(v));
    case 'ambientVol': return setStr(KEYS.ambientVol, String(v));
    case 'cloudSave':
      setStr(KEYS.cloudSave, v ? '1' : '0');
      if (v) remove(KEYS.backfill); // bật lại → cho phép đồng bộ lịch sử cũ thêm lần nữa
      return;
  }
}

type Data = Omit<AppState, 'setLang' | 'setPref' | 'setDeck' | 'saveAiSettings' | 'openOverlay' | 'closeOverlay' | 'openLightbox' | 'closeLightbox' | 'setBrowse' | 'requestRitual' | 'closeRitual'>;

/** Trạng thái ban đầu (đọc lại từ storage mỗi lần gọi — dùng cho khởi động và để reset trong test). */
export function initialState(): Data {
  return {
    lang: getStr(KEYS.lang, 'vi') === 'en' ? 'en' : 'vi',
    prefs: loadPrefs(),
    deck: null,
    decks: [],
    db: null,
    dbStatus: 'loading',
    dbError: '',
    cardEn: null,
    aiSettings: loadAiSettings(),
    overlay: null,
    lightbox: null,
    installPrompt: null,
    browse: { deck: null, category: 'all', query: '', picked: null },
    ritual: null,
  };
}

export const useApp = create<AppState>()(set => ({
  ...initialState(),
  setLang: l => {
    setStr(KEYS.lang, l);
    set({ lang: l });
  },
  setPref: (k, v) => {
    persistPref(k, v);
    set(s => ({ prefs: { ...s.prefs, [k]: v } }));
  },
  setDeck: d => {
    if (!d) return;
    setStr(KEYS.deck, d);
    // Như setDeck của bản cũ: Tra cứu về "Tất cả", xoá ô tìm — kể cả khi đổi lúc đang ở màn khác
    set({ deck: d, browse: { deck: d, category: 'all', query: '', picked: null } });
  },
  saveAiSettings: s => {
    persistAi(s);
    set({ aiSettings: s });
  },
  openOverlay: o => set({ overlay: o }),
  closeOverlay: () => set({ overlay: null }),
  openLightbox: (url, reversed) => set({ lightbox: { url, reversed } }),
  closeLightbox: () => set({ lightbox: null }),
  setBrowse: p => set(st => ({ browse: { ...st.browse, ...p } })),
  requestRitual: r => set({ ritual: r }),
  closeRitual: () => set({ ritual: null }),
}));
