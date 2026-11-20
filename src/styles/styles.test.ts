// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CSS_ORDER } from './order';

const here = dirname(fileURLToPath(import.meta.url));
const legacy = readFileSync(join(here, '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');

describe('legacy CSS is carried over verbatim', () => {
  it('the split files, joined in order, equal the legacy <style> content byte for byte', () => {
    const a = legacy.indexOf('<style>') + '<style>'.length;
    const b = legacy.indexOf('</style>', a);
    const joined = CSS_ORDER.map(f => readFileSync(join(here, f), 'utf8')).join('');
    expect(joined.length).toBe(b - a);
    expect(joined).toBe(legacy.slice(a, b));
  });
});
