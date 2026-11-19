import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFetch, streamResponse } from '../../../tests/helpers/stream';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../storage';
import {
  AiError, callBeeknoee, callFree, callGemini, callOllama, callZenmux, ollamaIsLocal,
  type ChatMessage, type ProviderCtx,
} from './providers';

const msgs: ChatMessage[] = [
  { role: 'system', content: 'SYS' },
  { role: 'user', content: 'hỏi' },
  { role: 'assistant', content: 'đáp' },
  { role: 'user', content: 'hỏi tiếp' },
];
const settings = (o: Partial<AiSettings> = {}): AiSettings => ({ ...DEFAULT_AI_SETTINGS, ...o });
const sink = () => {
  const t: string[] = [];
  const r: string[] = [];
  return { t, r, onToken: (x: string) => void t.push(x), onReasoning: (x: string) => void r.push(x) };
};

beforeEach(() => localStorage.clear());

describe('Gemini', () => {
  it('streams SSE parts, sends systemInstruction and maps assistant → model', async () => {
    const ff = fakeFetch(() =>
      streamResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Xin "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"chào"}]}}]}\n\ndata: [DONE]\n',
      ]),
    );
    const s = sink();
    await callGemini(msgs, s.onToken, s.onReasoning, { settings: settings({ geminiKey: 'K' }), lang: 'vi', deck: 'Witches Tarot', fetch: ff.fetch });
    expect(s.t.join('')).toBe('Xin chào');
    const call = ff.calls[0]!;
    expect(call.url).toContain('/models/gemini-flash-latest:streamGenerateContent?alt=sse&key=K');
    expect(call.body).toMatchObject({ systemInstruction: { parts: [{ text: 'SYS' }] }, generationConfig: { temperature: 0.9 } });
    expect((call.body as { contents: { role: string }[] }).contents.map(c => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('throws the legacy message when the key is missing, and the API error message on HTTP errors', async () => {
    const ctx: ProviderCtx = { settings: settings(), lang: 'vi', deck: '', fetch: fakeFetch(() => new Response('')).fetch };
    await expect(callGemini(msgs, () => {}, undefined, ctx)).rejects.toThrow('Chưa có Gemini API key');
    const bad = fakeFetch(() => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 }));
    await expect(
      callGemini(msgs, () => {}, undefined, { ...ctx, settings: settings({ geminiKey: 'K' }), fetch: bad.fetch }),
    ).rejects.toThrow('quota exceeded');
  });
});

describe('OpenAI-compatible (Beeknoee direct, ZenMux via proxy)', () => {
  const sse = () =>
    streamResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"nghĩ…"}}]}\n',
      'data: {"choices":[{"delta":{"content":"A"}}]}\ndata: {"choices":[{"delta":{"reasoning":"thêm"}}]}\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}\ndata: [DONE]\n',
    ]);

  it('routes content and reasoning; Beeknoee calls the API directly', async () => {
    const ff = fakeFetch(sse);
    const s = sink();
    await callBeeknoee(msgs, s.onToken, s.onReasoning, { settings: settings({ beeknoeeKey: 'B', beeknoeeModel: 'm1' }), lang: 'vi', deck: '', fetch: ff.fetch });
    expect(s.t.join('')).toBe('AB');
    expect(s.r.join('')).toBe('nghĩ…thêm');
    expect(ff.calls[0]!.url).toBe('https://platform.beeknoee.com/api/v1/chat/completions');
    expect(ff.calls[0]!.headers.Authorization).toBe('Bearer B');
    expect(ff.calls[0]!.body).toMatchObject({ model: 'm1', stream: true, max_tokens: 8000, messages: msgs });
  });

  it('ZenMux goes through /api/llm with x-target-url', async () => {
    const ff = fakeFetch(sse);
    const s = sink();
    await callZenmux(msgs, s.onToken, s.onReasoning, { settings: settings({ zenmuxKey: 'Z' }), lang: 'vi', deck: '', fetch: ff.fetch });
    expect(s.t.join('')).toBe('AB');
    expect(ff.calls[0]!.url).toBe('/api/llm');
    expect(ff.calls[0]!.headers['x-target-url']).toBe('https://zenmux.ai/api/v1/chat/completions');
    expect(ff.calls[0]!.body).not.toHaveProperty('model');
  });
});

describe('Ollama', () => {
  const ndjson = () =>
    streamResponse(['{"message":{"thinking":"hmm"}}\n{"message":{"content":"X"}}\n', '{"message":{"content":"Y"},"done":true}']);

  it('local URL is called directly; NDJSON content and thinking are routed', async () => {
    const ff = fakeFetch(ndjson);
    const s = sink();
    await callOllama(msgs, s.onToken, s.onReasoning, { settings: settings(), lang: 'vi', deck: '', fetch: ff.fetch });
    expect(s.t.join('')).toBe('XY');
    expect(s.r).toEqual(['hmm']);
    expect(ff.calls[0]!.url).toBe('http://localhost:11434/api/chat');
    expect(ff.calls[0]!.body).toMatchObject({ model: 'llama3.1', stream: true });
  });

  it('cloud URL goes through the proxy with the bearer key', async () => {
    const ff = fakeFetch(ndjson);
    await callOllama(msgs, () => {}, undefined, {
      settings: settings({ ollamaUrl: 'https://ollama.com/', ollamaKey: 'OK' }), lang: 'vi', deck: '', fetch: ff.fetch,
    });
    expect(ff.calls[0]!.url).toBe('/api/llm');
    expect(ff.calls[0]!.headers['x-target-url']).toBe('https://ollama.com/api/chat');
    expect(ff.calls[0]!.headers.Authorization).toBe('Bearer OK');
  });

  it('ollamaIsLocal', () => {
    for (const u of ['http://localhost:11434', 'http://127.0.0.1', 'http://[::1]:1', 'https://0.0.0.0/']) expect(ollamaIsLocal(u), u).toBe(true);
    for (const u of ['https://ollama.com', 'http://localhost.evil.com']) expect(ollamaIsLocal(u), u).toBe(false);
  });
});

describe('free AI endpoint', () => {
  it('POSTs {device_id, lang, deck, messages} without system messages and reads info headers', async () => {
    localStorage.setItem('tarotDeviceId', '0f8fad5b-d9cb-469f-a165-70867728950e');
    const ff = fakeFetch(() =>
      streamResponse(['Chào ', 'bạn'], { headers: { 'x-ai-provider': encodeURIComponent('gemini · flash-lite'), 'x-ai-remaining': '7' } }),
    );
    const s = sink();
    const info = await callFree(msgs, s.onToken, undefined, { settings: settings(), lang: 'en', deck: 'Witches Tarot', fetch: ff.fetch });
    expect(s.t.join('')).toBe('Chào bạn');
    expect(info).toEqual({ model: 'gemini · flash-lite', remaining: 7 });
    expect(ff.calls[0]!.url).toBe('/api/ai');
    expect(ff.calls[0]!.body).toEqual({
      device_id: '0f8fad5b-d9cb-469f-a165-70867728950e', lang: 'en', deck: 'Witches Tarot', messages: msgs.slice(1),
    });
  });

  it('maps quota and validation errors to the legacy messages', async () => {
    const ctx = (status: number, body: object, lang: 'vi' | 'en' = 'vi'): ProviderCtx => ({
      settings: settings(), lang, deck: '', fetch: fakeFetch(() => new Response(JSON.stringify(body), { status })).fetch,
    });
    await expect(callFree(msgs, () => {}, undefined, ctx(429, { scope: 'device', limit: 10 }))).rejects.toThrow(
      'Bạn đã dùng hết 10 lượt AI miễn phí hôm nay',
    );
    await expect(callFree(msgs, () => {}, undefined, ctx(429, { scope: 'device', limit: 5 }, 'en'))).rejects.toThrow(
      "You've used today's 5 free AI readings",
    );
    await expect(callFree(msgs, () => {}, undefined, ctx(429, { scope: 'global' }))).rejects.toThrow('AI miễn phí đã hết lượt chung của hôm nay');
    await expect(callFree(msgs, () => {}, undefined, ctx(400, { error: 'bad_messages' }, 'en'))).rejects.toThrow('max 6 follow-up questions');
    await expect(callFree(msgs, () => {}, undefined, ctx(503, {}))).rejects.toThrow('AI miễn phí đang bận');
    const e = await callFree(msgs, () => {}, undefined, ctx(500, {})).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AiError);
    expect((e as AiError).status).toBe(500);
    expect((e as AiError).message).toBe('AI miễn phí đang gặp sự cố (500)');
  });
});
