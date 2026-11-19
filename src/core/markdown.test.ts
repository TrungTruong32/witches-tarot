import { describe, expect, it } from 'vitest';
import { loadLegacy } from '../../tests/legacy/harness';
import { escapeHtml, renderMarkdown } from './markdown';

const L = loadLegacy<{ escapeHtml(s: unknown): string; renderMarkdown(s: string): string }>(['escapeHtml', 'renderMarkdown']);

const CORPUS = [
  '✨ **Tóm tắt:** một câu.\n\n# Tiêu đề\n- ý một\n* ý hai\n_x_ __đậm__ *nghiêng* `code`',
  '► Tổng hợp: a * b * c, 2*3 = 6',
  '',
  'dòng 1\ndòng 2\n   ### heading lệch',
];

describe('markdown', () => {
  it('matches legacy rendering', () => {
    for (const s of CORPUS) expect(renderMarkdown(s)).toBe(L.renderMarkdown(s));
    for (const v of ['<a href="x">&</a>', null, undefined, 42]) expect(escapeHtml(v)).toBe(L.escapeHtml(v));
  });
  it('escapes HTML coming from the AI', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)> <script>x</script> **"a"**');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img');
    expect(out).toContain('<strong>&quot;a&quot;</strong>');
  });
});
