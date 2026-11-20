import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../services/storage';
import { initialState, loadPrefs, useApp } from './store';

beforeEach(() => {
  localStorage.clear();
  useApp.setState(initialState());
});

describe('loadPrefs follows the legacy init code for each key', () => {
  it('empty storage → legacy defaults', () => {
    expect(loadPrefs()).toEqual({
      theme: '', fx: 'on', skyMode: 'deco', skyCity: 'hanoi', cardBack: 'zodiac', ritualOff: false, soundOn: true, soundVol: 0.7,
      ambientMode: 'off', ambientVol: 0.5, cloudSave: true,
    });
  });
  it('migrates the old tarotAmbient=1 flag to mystic, but an explicit mode wins', () => {
    localStorage.setItem('tarotAmbient', '1');
    expect(loadPrefs().ambientMode).toBe('mystic');
    localStorage.setItem('tarotAmbientMode', 'candle');
    expect(loadPrefs().ambientMode).toBe('candle');
  });
  it('keeps unknown theme strings as-is (legacy applies them verbatim) and maps old card backs', () => {
    localStorage.setItem('theme', 'bogus');
    localStorage.setItem('cardBack', 'night');
    const p = loadPrefs();
    expect(p.theme).toBe('bogus');
    expect(p.cardBack).toBe('stars');
  });
  it('reads booleans and clamped volumes like legacy', () => {
    localStorage.setItem('tarotRitual', '0');
    localStorage.setItem('tarotSound', '0');
    localStorage.setItem('tarotFx', '0');
    localStorage.setItem('tarotCloudSave', '0');
    localStorage.setItem('tarotSoundVol', '7');
    localStorage.setItem('tarotAmbientVol', 'abc');
    expect(loadPrefs()).toMatchObject({ ritualOff: true, soundOn: false, fx: 'off', cloudSave: false, soundVol: 1, ambientVol: 0.5 });
  });
});

describe('store', () => {
  it('lang: only "en" selects English (tarotLang=fr → vi)', () => {
    localStorage.setItem('tarotLang', 'fr');
    expect(initialState().lang).toBe('vi');
    localStorage.setItem('tarotLang', 'en');
    expect(initialState().lang).toBe('en');
  });
  it('setters persist to the legacy keys and formats', () => {
    const s = useApp.getState();
    s.setLang('en');
    s.setPref('theme', 'night');
    s.setPref('theme', '');
    s.setPref('fx', 'off');
    s.setPref('ritualOff', true);
    s.setPref('soundOn', false);
    s.setPref('soundVol', 0.3);
    s.setPref('ambientMode', 'candle');
    s.setPref('ambientVol', 0.2);
    s.setPref('skyMode', 'real');
    s.setPref('skyCity', 'hcm');
    s.setPref('cardBack', 'eye');
    expect({ ...localStorage }).toMatchObject({
      tarotLang: 'en', theme: '', tarotFx: '0', tarotRitual: '0', tarotSound: '0', tarotSoundVol: '0.3', tarotAmbientMode: 'candle',
      tarotAmbientVol: '0.2', tarotSkyMode: 'real', tarotSkyCity: 'hcm', cardBack: 'eye',
    });
    expect(useApp.getState().prefs.ritualOff).toBe(true);
  });
  it('turning cloud save on clears the backfill marker (legacy setCloudSave)', () => {
    localStorage.setItem('tarotCloudBackfill', 'done');
    useApp.getState().setPref('cloudSave', false);
    expect(localStorage.getItem('tarotCloudSave')).toBe('0');
    expect(localStorage.getItem('tarotCloudBackfill')).toBe('done');
    useApp.getState().setPref('cloudSave', true);
    expect(localStorage.getItem('tarotCloudSave')).toBe('1');
    expect(localStorage.getItem('tarotCloudBackfill')).toBeNull();
  });
  it('setDeck ignores empty values and persists the deck', () => {
    useApp.setState({ decks: ['Witches Tarot', 'Rider-Waite'], deck: 'Witches Tarot' });
    useApp.getState().setDeck('');
    expect(useApp.getState().deck).toBe('Witches Tarot');
    useApp.getState().setDeck('Rider-Waite');
    expect(useApp.getState().deck).toBe('Rider-Waite');
    expect(localStorage.getItem('witchesTarotDeck')).toBe('Rider-Waite');
  });
  it('AI settings round-trip through storage', () => {
    useApp.getState().saveAiSettings({ ...DEFAULT_AI_SETTINGS, geminiKey: 'k' });
    expect(JSON.parse(localStorage.getItem('witchesTarotAI')!).geminiKey).toBe('k');
    expect(initialState().aiSettings.geminiKey).toBe('k');
  });
  it('overlays and lightbox', () => {
    const s = useApp.getState();
    s.openOverlay('site');
    expect(useApp.getState().overlay).toBe('site');
    s.closeOverlay();
    expect(useApp.getState().overlay).toBeNull();
    s.openLightbox('x.jpg', true);
    expect(useApp.getState().lightbox).toEqual({ url: 'x.jpg', reversed: true });
    s.closeLightbox();
    expect(useApp.getState().lightbox).toBeNull();
  });
});
