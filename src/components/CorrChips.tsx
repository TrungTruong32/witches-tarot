// Dải "thẻ tương ứng" của một lá: nguyên tố (theo chất), số học, chiêm tinh (chỉ tiếng Việt). Như corrChips() bản cũ.
import { astroGlyph, elementOfSuit, ELEMENTS, NUMEROLOGY, NUMEROLOGY_EN } from '../core/cards';
import type { Card } from '../core/types';
import { useT } from '../i18n/useT';

export function CorrChips({ card }: { card: Pick<Card, 'bo' | 'so' | 'chiem_tinh_hoc'> }) {
  const { lang } = useT();
  const el = elementOfSuit(card.bo);
  const so = String(card.so).trim();
  const num = (lang === 'en' ? NUMEROLOGY_EN : NUMEROLOGY)[so];
  const astro = lang === 'vi' && card.chiem_tinh_hoc && card.chiem_tinh_hoc.trim() ? card.chiem_tinh_hoc.trim().replace(/\.$/, '') : '';
  if (!el && !num && !astro) return null;
  return (
    <div className="corr-chips">
      {el && (
        <span className={'corr-chip ' + el} title={ELEMENTS[el].hint}>
          <span className="ci">{ELEMENTS[el].emoji}</span>
          {lang === 'en' ? ELEMENTS[el].nameEn : ELEMENTS[el].name}
        </span>
      )}
      {num && (
        <span className="corr-chip" title="Numerology">
          <span className="ci">⚹</span>
          {so} · {num}
        </span>
      )}
      {astro && (
        <span className="corr-chip astro" title="Chiêm tinh">
          <span className="ci">{astroGlyph(astro)}</span>
          {astro}
        </span>
      )}
    </div>
  );
}
