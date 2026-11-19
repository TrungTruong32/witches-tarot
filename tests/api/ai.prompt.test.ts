import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'api', 'ai.js'), 'utf8');

describe('api/ai.js uses the shared system prompt', () => {
  it('has no local copy of the prompt', () => {
    expect(src).not.toMatch(/function systemPrompt\(/);
  });
  it('imports the shared builder and asks for the follow-up line', () => {
    expect(src).toContain("from '../shared/prompt.js'");
    expect(src).toMatch(/content: buildSystemPrompt\(.*, \{ followups: true \}\)/);
  });
  it('keeps the server-side guards', () => {
    expect(src).toMatch(/function cleanMessages\(/);
    expect(src).toContain('const GUARD =');
  });
});
