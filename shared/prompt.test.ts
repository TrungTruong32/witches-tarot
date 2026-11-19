import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './prompt.js';

const golden = (lang: string, side: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__golden__', `system-${lang}-${side}.txt`), 'utf8');

describe('buildSystemPrompt (shared by client and api/ai.js)', () => {
  for (const lang of ['vi', 'en'] as const) {
    it(`${lang}: client prompt equals the legacy client prompt byte-for-byte`, () => {
      expect(buildSystemPrompt(lang, 'Witches Tarot')).toBe(golden(lang, 'client'));
      expect(buildSystemPrompt(lang, 'Witches Tarot', { followups: false })).toBe(golden(lang, 'client'));
    });
    it(`${lang}: server prompt (followups) equals the legacy api/ai.js prompt byte-for-byte`, () => {
      expect(buildSystemPrompt(lang, 'Witches Tarot', { followups: true })).toBe(golden(lang, 'server'));
    });
    it(`${lang}: deck label appears verbatim on line 2; followups adds exactly one line`, () => {
      expect(buildSystemPrompt(lang, 'Rider-Waite').split('\n')[1]).toContain('"Rider-Waite"');
      const a = buildSystemPrompt(lang, 'X').split('\n').length;
      const b = buildSystemPrompt(lang, 'X', { followups: true }).split('\n').length;
      expect(b - a).toBe(1);
    });
  }
});
