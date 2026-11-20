// Cài đặt trang: ngôn ngữ, giao diện, mặt lưng bài, nghi thức, âm thanh, lưu ẩn danh, nhạc nền, hiệu ứng, kiểu sao nền.
// Markup theo bản cũ L1268–1337; hành vi theo initSiteSettings / initCardBack / initTheme (L2389–2471, L5677–5710).
// Ảnh thu nhỏ mặt lưng: gán thẳng thuộc tính style như bản cũ (nền nhiều lớp url(...) + màu).
// Mọi thay đổi ghi thẳng vào store (→ localStorage key cũ); nhạc nền/âm thanh/sao nền đọc store (Kế hoạch 2c).
import { useApp } from '../../app/store';
import { ModalOverlay } from '../../components/Overlay';
import { CARD_BACK_KEYS, CARD_BACK_NAMES, cardBackCss } from '../../core/cardBacks';
import { useT } from '../../i18n/useT';

const CITY_VN: Record<string, string> = { hanoi: 'Hà Nội', danang: 'Đà Nẵng', hcm: 'TP.HCM' };
const CITY_EN: Record<string, string> = { hanoi: 'Hanoi', danang: 'Da Nang', hcm: 'HCMC' };
const pct = (v: number) => Math.round(v * 100);
const fromPct = (s: string) => Math.min(1, Math.max(0, Number(s) / 100));


/** Ảnh thu nhỏ mặt lưng: nền nhiều lớp url(...) gán thẳng vào thuộc tính style như bản cũ.
 *  Ref callback ổn định theo từng mặt lưng → chỉ gán một lần khi gắn vào DOM, không gán lại mỗi lần render. */
const THUMB_REF: Record<string, (el: HTMLSpanElement | null) => void> = Object.fromEntries(
  CARD_BACK_KEYS.map(k => [k, (el: HTMLSpanElement | null) => el?.setAttribute('style', 'background:' + cardBackCss(k))]),
);

export function SiteSettings() {
  const { t, lang, pick } = useT();
  const open = useApp(s => s.overlay === 'site');
  const close = useApp(s => s.closeOverlay);
  const prefs = useApp(s => s.prefs);
  const setPref = useApp(s => s.setPref);
  const setLang = useApp(s => s.setLang);
  const en = lang === 'en';
  const real = prefs.skyMode === 'real';
  const cbName = (k: string) => (CARD_BACK_NAMES[k] ?? [k, k])[en ? 1 : 0];
  const skyHint = real
    ? en
      ? 'Draws the real sky over ' + (CITY_EN[prefs.skyCity] ?? 'HCMC') + ' as a background. For an interactive map you can drag, open the “Sky” menu.'
      : 'Vẽ bầu trời thật trên ' + (CITY_VN[prefs.skyCity] ?? '') + ' làm nền. Muốn bản đồ tương tác kéo được, mở mục “Thiên văn” trong menu.'
    : pick({ vi: 'Sao lấp lánh ngẫu nhiên để trang trí.', en: 'Random decorative twinkling stars.' });

  return (
    <ModalOverlay id="siteOverlay" open={open} onClose={close}>
      <h2>{t('site.title')}</h2>
      <div className="hint" style={{ margin: '-6px 0 14px' }}>Mọi thay đổi áp dụng ngay và được lưu trong trình duyệt của bạn.</div>

      <div className="field">
        <label htmlFor="langSel">{t('site.lang')}</label>
        {/* Nghĩa lá tiếng Anh tự nạp khi ngôn ngữ chuyển sang EN (watchLangForCardEn trong boot.ts) */}
        <select id="langSel" value={lang} onChange={e => setLang(e.target.value === 'en' ? 'en' : 'vi')}>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="themeSel">{t('site.theme')}</label>
        <select id="themeSel" value={prefs.theme} onChange={e => setPref('theme', e.target.value)}>
          <option value="">Tím (Tối)</option>
          <option value="night">Xanh đêm</option>
          <option value="rose">Hồng huyền</option>
          <option value="light">Sáng</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="cardBackSel">{t('site.cardback')}</label>
        <select id="cardBackSel" value={prefs.cardBack} onChange={e => setPref('cardBack', e.target.value)}>
          {CARD_BACK_KEYS.map(k => <option key={k} value={k}>{cbName(k)}</option>)}
        </select>
        <div className="cb-grid" id="cardBackGrid">
          {CARD_BACK_KEYS.map(k => (
            <button key={k} type="button" className={'cb-opt' + (prefs.cardBack === k ? ' on' : '')} data-k={k} title={cbName(k)} onClick={() => setPref('cardBack', k)}>
              <span className="cb-thumb" ref={THUMB_REF[k]}></span>
              <span className="cb-name">{cbName(k)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t('site.ritualHead')}</label>
        <label className="site-check">
          <input type="checkbox" id="siteRitual" checked={!prefs.ritualOff} onChange={e => setPref('ritualOff', !e.target.checked)} /> <span>{t('site.ritual')}</span>
        </label>
      </div>

      <div className="field">
        <label>{t('site.sound')}</label>
        <label className="site-check">
          <input type="checkbox" id="siteSound" checked={prefs.soundOn} onChange={e => setPref('soundOn', e.target.checked)} /> <span>{t('site.soundOn')}</span>
        </label>
        <div className="site-vol">
          <span>{t('site.vol')}</span>
          <input type="range" id="siteSoundVol" min="0" max="100" value={pct(prefs.soundVol)} onChange={e => setPref('soundVol', fromPct(e.target.value))} />
        </div>
      </div>

      <div className="field">
        <label>{t('site.cloudHead')}</label>
        <label className="site-check">
          <input type="checkbox" id="siteCloud" checked={prefs.cloudSave} onChange={e => setPref('cloudSave', e.target.checked)} /> <span>{t('site.cloudOn')}</span>
        </label>
        <div className="hint">{t('site.cloudHint')}</div>
      </div>

      <div className="field">
        <label htmlFor="ambientMode">{t('site.music')}</label>
        <select id="ambientMode" value={prefs.ambientMode} onChange={e => setPref('ambientMode', e.target.value)}>
          <option value="off">{t('music.off')}</option>
          <option value="mystic">{t('music.mystic')}</option>
          <option value="candle">{t('music.candle')}</option>
        </select>
        <div className="site-vol">
          <span>{t('site.vol')}</span>
          <input type="range" id="ambientVol" min="0" max="100" value={pct(prefs.ambientVol)} onChange={e => setPref('ambientVol', fromPct(e.target.value))} />
        </div>
      </div>

      <div className="field">
        <label>{t('site.fxHead')}</label>
        <label className="site-check">
          <input type="checkbox" id="siteFx" checked={prefs.fx !== 'off'} onChange={e => setPref('fx', e.target.checked ? 'on' : 'off')} /> <span>{t('site.fx')}</span>
        </label>
      </div>

      <div className="field">
        <label htmlFor="skyMode">{t('site.sky')}</label>
        <select id="skyMode" value={prefs.skyMode} onChange={e => setPref('skyMode', e.target.value)}>
          <option value="deco">{t('sky.deco')}</option>
          <option value="real">{t('sky.real')}</option>
        </select>
        <div className="site-vol" id="skyCityRow" style={{ display: real ? 'flex' : 'none' }}>
          <span>{t('site.city')}</span>
          <select id="skyCity" value={prefs.skyCity} onChange={e => setPref('skyCity', e.target.value)}>
            <option value="hanoi">Hà Nội</option>
            <option value="danang">Đà Nẵng</option>
            <option value="hcm">TP.HCM</option>
          </select>
        </div>
        <div className="hint" id="skyHint" style={{ marginTop: '6px' }}>{skyHint}</div>
      </div>

      <div className="modal-actions">
        <button className="btn-primary" id="closeSite" onClick={close}>{t('site.done')}</button>
      </div>
    </ModalOverlay>
  );
}
