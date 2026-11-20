import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../../tests/legacy/harness';
import { fakeFetch, streamResponse } from '../../../tests/helpers/stream';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../storage';
import { listModels, orderModels, providerLabel, RECOMMENDED, testModel } from './models';

const s = (o: Partial<AiSettings> = {}): AiSettings => ({ ...DEFAULT_AI_SETTINGS, ...o });

describe('orderModels = legacy populateModels ordering', () => {
  // populateModels chỉ đọc/ghi DOM ở cuối; chạy bản cũ với một input + datalist giả để lấy thứ tự
  const run = (models: string[], preferred?: string[]) => {
    const dl = { innerHTML: '', options: [] as string[], appendChild(o: { value: string }) { this.options.push(o.value); } };
    const input = { value: '', getAttribute: () => 'x' };
    const { fns } = loadLegacyWithContext<{ populateModels(i: unknown, m: string[], sel: string, p?: string[]): void }>(
      ['_normModel', 'fillDatalist', 'populateModels'],
      { document: { getElementById: () => dl, createElement: () => ({ value: '' }) } },
    );
    fns.populateModels(input, models, '', preferred);
    return dl.options;
  };
  it('recommended first (normalised match, kept even if the API lacks them), then the rest', () => {
    const api = ['zeta', 'glm-4.7-flash', 'alpha', 'GPT-OSS-120B'];
    expect(orderModels(api, RECOMMENDED.beeknoee)).toEqual(run(api, RECOMMENDED.beeknoee));
    expect(orderModels(api)).toEqual(run(api));
    expect(orderModels([], RECOMMENDED.zenmux)).toEqual(run([], RECOMMENDED.zenmux));
  });
});

describe('listModels', () => {
  it('Gemini follows nextPageToken and keeps only generateContent models, sorted', async () => {
    let page = 0;
    const ff = fakeFetch(() => new Response(JSON.stringify(page++ === 0
      ? { models: [{ name: 'models/b', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'T' }
      : { models: [{ name: 'models/a', supportedGenerationMethods: ['generateContent'] }] })));
    expect(await listModels('gemini', s({ geminiKey: 'K' }), ff.fetch)).toEqual(['a', 'b']);
    expect(ff.calls[1]!.url).toContain('pageToken=T');
  });
  it('ZenMux goes through /api/llm; Beeknoee direct; both dedupe + sort', async () => {
    const body = () => new Response(JSON.stringify({ data: [{ id: 'm2' }, { id: 'm1' }, { id: 'm2' }] }));
    const z = fakeFetch(body);
    expect(await listModels('zenmux', s({ zenmuxKey: 'Z' }), z.fetch)).toEqual(['m1', 'm2']);
    expect(z.calls[0]!.url).toBe('/api/llm');
    expect(z.calls[0]!.headers['x-target-url']).toBe('https://zenmux.ai/api/v1/models');
    const b = fakeFetch(body);
    await listModels('beeknoee', s({ beeknoeeKey: 'B' }), b.fetch);
    expect(b.calls[0]!.url).toBe('https://platform.beeknoee.com/api/v1/models');
  });
  it('Ollama local calls /api/tags directly', async () => {
    const ff = fakeFetch(() => new Response(JSON.stringify({ models: [{ name: 'qwen' }, { name: 'llama3.1' }] })));
    expect(await listModels('ollama', s(), ff.fetch)).toEqual(['llama3.1', 'qwen']);
    expect(ff.calls[0]!.url).toBe('http://localhost:11434/api/tags');
  });
  it('missing key → legacy message; HTTP error → API message', async () => {
    await expect(listModels('gemini', s(), fakeFetch(() => new Response('')).fetch)).rejects.toThrow('Nhập API key trước đã.');
    const bad = fakeFetch(() => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }));
    await expect(listModels('gemini', s({ geminiKey: 'K' }), bad.fetch)).rejects.toThrow('API key not valid');
  });
});

describe('testModel', () => {
  it('Gemini makes a real 1-shot generateContent call', async () => {
    const ff = fakeFetch(() => new Response('{}'));
    await testModel('gemini', s({ geminiKey: 'K', geminiModel: 'gemini-flash-latest' }), ff.fetch);
    expect(ff.calls[0]!.url).toContain('/models/gemini-flash-latest:generateContent?key=K');
  });
  it('Ollama cloud without key is refused with the legacy message', async () => {
    await expect(testModel('ollama', s({ ollamaUrl: 'https://ollama.com' }), fakeFetch(() => new Response('')).fetch)).rejects.toThrow('Ollama Cloud cần API key.');
  });
  it('ZenMux streams through the proxy and cancels the body', async () => {
    const ff = fakeFetch(() => streamResponse(['data: {}\n']));
    await testModel('zenmux', s({ zenmuxKey: 'Z', zenmuxModel: 'm' }), ff.fetch);
    expect(ff.calls[0]!.headers['x-target-url']).toBe('https://zenmux.ai/api/v1/chat/completions');
    expect(ff.calls[0]!.body).toMatchObject({ model: 'm', stream: true, max_tokens: 16 });
  });
  it('no model selected → legacy message', async () => {
    await expect(testModel('beeknoee', s({ beeknoeeKey: 'B' }), fakeFetch(() => new Response('')).fetch)).rejects.toThrow('Chọn/tải model trước.');
  });
});

describe('providerLabel matches legacy', () => {
  const { fns, ctx } = loadLegacyWithContext<{ providerLabel(p: string): string }>(['providerLabel'], { lang: 'vi', settings: {}, freeAiInfo: {} });
  it('for every provider, language and free-AI info', () => {
    const settings = s({ geminiModel: 'g1', beeknoeeModel: '', zenmuxModel: 'zz', ollamaModel: 'llama3.1' });
    for (const lang of ['vi', 'en'] as const)
      for (const info of [{ model: '', remaining: null }, { model: 'gemini · lite', remaining: 7 }])
        for (const p of ['free', 'gemini', 'beeknoee', 'zenmux', 'ollama'] as const) {
          Object.assign(ctx, { lang, settings, freeAiInfo: info });
          expect(providerLabel(p, settings, lang, info)).toBe(fns.providerLabel(p));
        }
  });
});
