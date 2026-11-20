import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { IconSprite } from './IconSprite';
import { Logo } from './Logo';

const legacy = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');
const lines = legacy.split('\n');
const norm = (html: string) => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild!.innerHTML;

describe('verbatim SVG markup', () => {
  it('IconSprite renders the legacy sprite (line 832) with all 19 symbols', () => {
    const { container } = render(<IconSprite />);
    expect(container.querySelector('svg')!.outerHTML).toBe(norm(lines[831]!.trim()));
    expect(container.querySelectorAll('symbol[id^="i-"]').length).toBe(19);
  });

  it('Logo variants render the legacy inline logos', () => {
    const grab = (line: string, cls: string) => {
      const a = line.indexOf(`<svg viewBox="0 0 64 64" class="${cls}"`);
      return line.slice(a, line.indexOf('</svg>', a) + 6);
    };
    const L = render(<Logo variant="L" />).container.querySelector('svg')!.outerHTML;
    const H = render(<Logo variant="H" />).container.querySelector('svg')!.outerHTML;
    expect(L).toBe(norm(grab(lines[867]!, 'logo-lg')));
    expect(H).toBe(norm(grab(lines[914]!, 'logo')));
  });

  it('Icon renders <svg class="ico"><use href="#i-name"/></svg> like legacy icoSvg', () => {
    const { container } = render(<Icon name="moon" />);
    expect(container.innerHTML).toBe('<svg class="ico" aria-hidden="true"><use href="#i-moon"></use></svg>');
  });
});
