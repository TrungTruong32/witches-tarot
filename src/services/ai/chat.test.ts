import { describe, expect, it, vi } from 'vitest';
import { loadLegacyWithContext } from '../../../tests/legacy/harness';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../storage';
import { chatComplete, providerChain, PROVIDER_ORDER } from './chat';
import type { ProviderCall, ProviderCtx, ProviderId } from './providers';

type Legacy = { providerChain(): string[]; PROVIDER_ORDER: string[] };
const { fns: L, ctx: lctx } = loadLegacyWithContext<Legacy>(['DEFAULT_SETTINGS', 'providerReady', 'PROVIDER_ORDER', 'providerChain'], {
  settings: {},
});

describe('providerChain matches legacy', () => {
  it('PROVIDER_ORDER is the legacy order', () => {
    expect(PROVIDER_ORDER).toEqual([...L.PROVIDER_ORDER]);
  });

  it('for every provider × keys × autoFallback × freeAi combination', () => {
    const keySets: Partial<AiSettings>[] = [
      {}, { geminiKey: 'g' }, { zenmuxKey: 'z' }, { geminiKey: 'g', beeknoeeKey: 'b' },
      { ollamaKey: 'o' }, { ollamaUrl: 'http://192.168.1.5:11434' }, { ollamaModel: '' },
      { geminiKey: 'g', zenmuxKey: 'z', beeknoeeKey: 'b', ollamaKey: 'o' },
    ];
    for (const provider of ['gemini', 'beeknoee', 'zenmux', 'ollama'] as const)
      for (const keys of keySets)
        for (const autoFallback of [true, false])
          for (const freeAi of [undefined, true, false]) {
            const s: AiSettings = { ...DEFAULT_AI_SETTINGS, ...keys, provider, autoFallback, ...(freeAi === undefined ? {} : { freeAi }) };
            lctx.settings = s;
            expect(providerChain(s), JSON.stringify({ provider, keys, autoFallback, freeAi })).toEqual([...L.providerChain()]);
          }
  });
});

const ctx: ProviderCtx = { settings: { ...DEFAULT_AI_SETTINGS, geminiKey: 'g', autoFallback: true }, lang: 'vi', deck: '' };
const calls = (impl: Partial<Record<ProviderId, ProviderCall>>): Record<ProviderId, ProviderCall> => {
  const never: ProviderCall = async () => {
    throw new Error('should not be called');
  };
  return { free: never, gemini: never, beeknoee: never, zenmux: never, ollama: never, ...impl };
};

describe('chatComplete fallback', () => {
  it('falls back to the next provider when the first fails before any token, and reports the switch', async () => {
    const tokens: string[] = [];
    const onSwitch = vi.fn();
    const used = await chatComplete([], { onToken: t => void tokens.push(t), onSwitch }, ctx, calls({
      gemini: async () => {
        throw new Error('429');
      },
      free: async (_m, onToken) => onToken('từ free'),
    }));
    expect(used).toBe('free');
    expect(tokens).toEqual(['từ free']);
    expect(onSwitch).toHaveBeenCalledWith('gemini', 'free', expect.any(Error));
  });

  it('treats an empty answer as a failure when there is a next provider', async () => {
    const used = await chatComplete([], { onToken: () => {} }, ctx, calls({
      gemini: async () => {},
      free: async (_m, onToken) => onToken('ok'),
    }));
    expect(used).toBe('free');
  });

  it('accepts an empty answer from the last provider', async () => {
    const noFree = { ...ctx, settings: { ...ctx.settings, freeAi: false } };
    expect(await chatComplete([], { onToken: () => {} }, noFree, calls({ gemini: async () => {} }))).toBe('gemini');
  });

  it('does NOT fall back once tokens have streamed (no spliced answers)', async () => {
    const tokens: string[] = [];
    const free = vi.fn<ProviderCall>(async () => {});
    const err = new Error('stream cut');
    await expect(
      chatComplete([], { onToken: t => void tokens.push(t) }, ctx, calls({
        gemini: async (_m, onToken) => {
          onToken('abc');
          throw err;
        },
        free,
      })),
    ).rejects.toBe(err);
    expect(free).not.toHaveBeenCalled();
    expect(tokens).toEqual(['abc']);
  });

  it('rethrows the last provider error', async () => {
    const err = new Error('all down');
    await expect(
      chatComplete([], { onToken: () => {} }, ctx, calls({
        gemini: async () => {
          throw new Error('first');
        },
        free: async () => {
          throw err;
        },
      })),
    ).rejects.toBe(err);
  });
});
