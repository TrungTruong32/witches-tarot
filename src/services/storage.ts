// localStorage có kiểu. Tên key và định dạng giá trị GIỮ NGUYÊN như bản cũ để người dùng cũ không mất cài đặt.
// Mọi lệnh đều nuốt lỗi: Safari chế độ riêng tư / bị chặn cookie sẽ ném lỗi khi đọc-ghi.

export const KEYS = {
  aiSettings: 'witchesTarotAI',
  deck: 'witchesTarotDeck',
  cardBack: 'cardBack',
  lang: 'tarotLang',
  theme: 'theme',
  deviceId: 'tarotDeviceId',
  cloudSave: 'tarotCloudSave',
  backfill: 'tarotCloudBackfill',
  ritual: 'tarotRitual',
  sound: 'tarotSound',
  soundVol: 'tarotSoundVol',
  ambient: 'tarotAmbient',
  ambientMode: 'tarotAmbientMode',
  ambientVol: 'tarotAmbientVol',
  fx: 'tarotFx',
  skyMode: 'tarotSkyMode',
  skyCity: 'tarotSkyCity',
  skyLoc: 'tarotSkyLoc',
  skyLayers: 'tarotSkyLayers',
} as const;

const DAILY_PREFIX = 'dailyNote:';

export function getStr(key: string, fallback: string): string {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function setStr(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* không lưu được thì thôi */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

export function getJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export const dailyNoteKey = (day: string): `dailyNote:${string}` => `${DAILY_PREFIX}${day}`;

/** Mọi ghi chú "lá bài hôm nay" không rỗng, theo ngày. */
export function allDailyNotes(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DAILY_PREFIX)) continue;
      const v = localStorage.getItem(k);
      if (v && v.trim()) out[k.slice(DAILY_PREFIX.length)] = v;
    }
  } catch {
    /* bỏ qua */
  }
  return out;
}

export type BYOKProvider = 'gemini' | 'beeknoee' | 'zenmux' | 'ollama';

export interface AiSettings {
  provider: BYOKProvider;
  geminiKey: string;
  geminiModel: string;
  beeknoeeKey: string;
  beeknoeeModel: string;
  beeknoeeUrl: string;
  zenmuxKey: string;
  zenmuxModel: string;
  zenmuxUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaKey: string;
  autoFallback: boolean;
  /** Dùng AI miễn phí của site khi không có key riêng (mặc định bật; chỉ có sau khi người dùng lưu cài đặt). */
  freeAi?: boolean;
}

export const DEFAULT_AI_SETTINGS: Readonly<AiSettings> = Object.freeze({
  provider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  beeknoeeKey: '',
  beeknoeeModel: '',
  beeknoeeUrl: 'https://platform.beeknoee.com/api/v1',
  zenmuxKey: '',
  zenmuxModel: '',
  zenmuxUrl: 'https://zenmux.ai/api/v1',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  ollamaKey: '',
  autoFallback: true,
});

export function loadAiSettings(): AiSettings {
  const stored = getJson<Partial<AiSettings> | null>(KEYS.aiSettings, null);
  return Object.assign({}, DEFAULT_AI_SETTINGS, stored && typeof stored === 'object' ? stored : {});
}

export function saveAiSettings(s: AiSettings): void {
  setStr(KEYS.aiSettings, JSON.stringify(s));
}

/** UUID ngẫu nhiên của trình duyệt này (không gắn với danh tính); null nếu không lưu được. */
export function deviceId(): string | null {
  try {
    let id = localStorage.getItem(KEYS.deviceId);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEYS.deviceId, id);
    }
    return id;
  } catch {
    return null;
  }
}
