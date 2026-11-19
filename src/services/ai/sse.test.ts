import { describe, expect, it } from 'vitest';
import { streamResponse } from '../../../tests/helpers/stream';
import { streamLines } from './sse';

describe('streamLines', () => {
  it('reassembles lines split across chunks and flushes the unterminated last line', async () => {
    const lines: string[] = [];
    await streamLines(streamResponse(['da', 'ta: 1\nda', 'ta: 2\n\ntail']), l => lines.push(l));
    expect(lines).toEqual(['data: 1', 'data: 2', '', 'tail']);
  });

  it('decodes a multi-byte UTF-8 character split across chunks', async () => {
    const bytes = new TextEncoder().encode('Tình\n');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 2));
        c.enqueue(bytes.slice(2));
        c.close();
      },
    });
    const lines: string[] = [];
    await streamLines(new Response(body), l => lines.push(l));
    expect(lines).toEqual(['Tình']);
  });
});
