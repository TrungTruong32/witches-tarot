import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx } from '../../tests/fixtures/cards';
import { useApp } from '../app/store';
import { CorrChips } from './CorrChips';

const { fns: L, ctx } = loadLegacyWithContext<{ corrChips(c: object): string }>(
  ['escapeHtml', 'ELEMENTS', 'NUMEROLOGY_EN', 'NUMEROLOGY', 'elementOfSuit', 'ASTRO_GLYPHS', 'astroGlyph', 'corrChips'],
  { lang: 'vi' },
);
const norm = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.innerHTML;
};

beforeEach(() => useApp.setState({ lang: 'vi' }));

describe('CorrChips matches legacy corrChips() HTML', () => {
  const cards = [fx.fool, fx.tower, fx.aceWands, fx.threeCups, fx.kingSwords, { ...fx.fool, bo: 'Oracle', so: 'x', chiem_tinh_hoc: '' }];
  for (const lang of ['vi', 'en'] as const) {
    it(lang, () => {
      act(() => useApp.setState({ lang }));
      ctx.lang = lang;
      for (const c of cards) {
        const { container, unmount } = render(<CorrChips card={c} />);
        expect(container.innerHTML, `${lang} ${c.ten}`).toBe(norm(L.corrChips(c)));
        unmount();
      }
    });
  }
});
