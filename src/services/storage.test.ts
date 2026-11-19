import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allDailyNotes, DEFAULT_AI_SETTINGS, dailyNoteKey, deviceId, getJson, getStr, KEYS, loadAiSettings, remove,
  saveAiSettings, setStr,
} from './storage';

const CONTRACT = [
  'witchesTarotAI', 'witchesTarotDeck', 'cardBack', 'tarotAmbient', 'tarotAmbientMode', 'tarotAmbientVol',
  'tarotCloudBackfill', 'tarotCloudSave', 'tarotDeviceId', 'tarotFx', 'tarotLang', 'tarotRitual', 'tarotSkyCity',
  'tarotSkyLayers', 'tarotSkyLoc', 'tarotSkyMode', 'tarotSound', 'tarotSoundVol', 'theme',
];

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('storage key contract', () => {
  it('KEYS is exactly the legacy key list (plus dailyNote:* prefix)', () => {
    expect(Object.values(KEYS).sort()).toEqual([...CONTRACT].sort());
    expect(dailyNoteKey('2026-11-19')).toBe('dailyNote:2026-11-19');
  });
});

describe('basic accessors', () => {
  it('get/set/remove strings and JSON', () => {
    expect(getStr(KEYS.lang, 'vi')).toBe('vi');
    setStr(KEYS.lang, 'en');
    expect(getStr(KEYS.lang, 'vi')).toBe('en');
    remove(KEYS.lang);
    expect(getStr(KEYS.lang, 'vi')).toBe('vi');
    localStorage.setItem(KEYS.skyLoc, '{"lat":10.8}');
    expect(getJson(KEYS.skyLoc, null)).toEqual({ lat: 10.8 });
    localStorage.setItem(KEYS.skyLoc, '{oops');
    expect(getJson(KEYS.skyLoc, 'fb')).toBe('fb');
  });
});

describe('AI settings', () => {
  it('merges a partial stored object over the legacy defaults', () => {
    localStorage.setItem('witchesTarotAI', JSON.stringify({ provider: 'ollama', geminiKey: 'k' }));
    expect(loadAiSettings()).toEqual({ ...DEFAULT_AI_SETTINGS, provider: 'ollama', geminiKey: 'k' });
  });
  it('returns defaults on corrupt JSON and round-trips saves', () => {
    localStorage.setItem('witchesTarotAI', '{bad');
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    saveAiSettings({ ...DEFAULT_AI_SETTINGS, freeAi: false });
    expect(JSON.parse(localStorage.getItem('witchesTarotAI') as string).freeAi).toBe(false);
  });
  it('defaults are the legacy values', () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      provider: 'gemini', geminiKey: '', geminiModel: 'gemini-flash-latest', beeknoeeKey: '', beeknoeeModel: '',
      beeknoeeUrl: 'https://platform.beeknoee.com/api/v1', zenmuxKey: '', zenmuxModel: '', zenmuxUrl: 'https://zenmux.ai/api/v1',
      ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1', ollamaKey: '', autoFallback: true,
    });
  });
});

describe('deviceId', () => {
  it('keeps a valid stored UUID', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    localStorage.setItem('tarotDeviceId', id);
    expect(deviceId()).toBe(id);
  });
  it('replaces an invalid one with a new persisted UUID', () => {
    localStorage.setItem('tarotDeviceId', 'abc');
    const id = deviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(localStorage.getItem('tarotDeviceId')).toBe(id);
  });
});

describe('daily notes', () => {
  it('returns only non-blank dailyNote:* entries with the prefix stripped', () => {
    localStorage.setItem('dailyNote:2026-11-18', 'hôm qua');
    localStorage.setItem('dailyNote:2026-11-19', '   ');
    localStorage.setItem('theme', 'dark');
    expect(allDailyNotes()).toEqual({ '2026-11-18': 'hôm qua' });
  });
});

describe('localStorage unavailable (Safari private mode)', () => {
  beforeEach(() => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'key').mockImplementation(boom);
  });
  it('never throws and returns fallbacks', () => {
    expect(getStr(KEYS.theme, 'dark')).toBe('dark');
    expect(() => setStr(KEYS.theme, 'x')).not.toThrow();
    expect(() => remove(KEYS.theme)).not.toThrow();
    expect(getJson(KEYS.skyLoc, 1)).toBe(1);
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    expect(() => saveAiSettings(DEFAULT_AI_SETTINGS)).not.toThrow();
    expect(deviceId()).toBeNull();
    expect(allDailyNotes()).toEqual({});
  });
});
