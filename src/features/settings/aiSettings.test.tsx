import { act, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, useApp } from '../../app/store';
import { DEFAULT_AI_SETTINGS } from '../../services/storage';
import { AiSettings } from './AiSettings';

const legacyHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');
const legacy = new DOMParser().parseFromString(legacyHtml, 'text/html').getElementById('settingsOverlay')!;
const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const open = () => act(() => useApp.getState().openOverlay('ai'));
const stored = () => JSON.parse(localStorage.getItem('witchesTarotAI') || '{}');

beforeEach(() => {
  localStorage.clear();
  useApp.setState(initialState());
});
afterEach(() => vi.restoreAllMocks());

describe('AiSettings markup matches legacy', () => {
  it('same ids, labels and hint texts in the same order', () => {
    render(<AiSettings />);
    const ours = $<HTMLElement>('settingsOverlay');
    const ids = (root: Element) => [...root.querySelectorAll('[id]')].map(e => e.id);
    expect(ids(ours)).toEqual(ids(legacy));
    const texts = (root: Element, sel: string) => [...root.querySelectorAll(sel)].map(e => e.textContent!.replace(/\s+/g, ' ').trim());
    expect(texts(ours, '.hint')).toEqual(texts(legacy, '.hint'));
    expect(texts(ours, 'label')).toEqual(texts(legacy, 'label'));
    expect(texts(ours, 'button')).toEqual(texts(legacy, 'button'));
    const attrs = (root: Element) => [...root.querySelectorAll('input')].map(i => [i.id, i.type, i.getAttribute('placeholder'), i.getAttribute('list')].join('|'));
    expect(attrs(ours)).toEqual(attrs(legacy));
  });
});

describe('AiSettings behaviour', () => {
  it('opening loads the saved settings and selects the saved provider tab', () => {
    localStorage.setItem('witchesTarotAI', JSON.stringify({ provider: 'zenmux', zenmuxKey: 'zk', autoFallback: false, freeAi: false }));
    useApp.setState(initialState()); // khởi động lại app: store đọc từ localStorage (khoá cũ)
    render(<AiSettings />);
    open();
    expect($('provZenmux').classList.contains('on')).toBe(true);
    expect($('zenmuxFields').style.display).toBe('block');
    expect($('geminiFields').style.display).toBe('none');
    expect($('zenmuxKey').value).toBe('zk');
    expect($('autoFallback').checked).toBe(false);
    expect($('freeAi').checked).toBe(false);
    const dl = document.getElementById('zenmuxModelList')!;
    expect([...dl.querySelectorAll('option')].map(o => o.getAttribute('value'))).toEqual(['x-ai/grok-4.5-free', 'z-ai/glm-4.7-flash-free']);
  });

  it('save builds settings like legacy (trim, strip trailing /, defaults) and shows the provider chain', async () => {
    render(<AiSettings />);
    open();
    await userEvent.click($('provOllama'));
    fireEvent.change($('ollamaUrl'), { target: { value: '  http://x:11434/ ' } });
    fireEvent.change($('ollamaModel'), { target: { value: '' } });
    fireEvent.change($('geminiKey'), { target: { value: ' AIzaKEY ' } });
    await userEvent.click($('saveSettings'));
    expect(stored()).toMatchObject({ provider: 'ollama', ollamaUrl: 'http://x:11434', ollamaModel: 'llama3.1', geminiKey: 'AIzaKEY', autoFallback: true, freeAi: true });
    expect(useApp.getState().aiSettings.provider).toBe('ollama');
    expect($('savedNote').textContent).toBe('✓ Đã lưu. Provider đang dùng: Ollama (llama3.1) · Dự phòng: Gemini (gemini-flash-latest) → AI miễn phí');
  });

  it('switching tabs is UI-only until Save', async () => {
    render(<AiSettings />);
    open();
    await userEvent.click($('provBeeknoee'));
    expect($('beeknoeeFields').style.display).toBe('block');
    expect(localStorage.getItem('witchesTarotAI')).toBeNull();
  });

  it('load models fills the datalist, recommended first, and reports the count', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'zeta' }, { id: 'GLM-4.7-Flash' }] })));
    render(<AiSettings />);
    open();
    await userEvent.click($('provBeeknoee'));
    fireEvent.change($('beeknoeeKey'), { target: { value: 'bk' } });
    await userEvent.click($('loadBeeknoeeModels'));
    await vi.waitFor(() => expect($('beeknoeeModelStatus').textContent).toBe('✓ Key hợp lệ — 2 model. Chọn model rồi bấm Lưu.'));
    const opts = [...document.querySelectorAll('#beeknoeeModelList option')].map(o => o.getAttribute('value'));
    expect(opts).toEqual(['GLM-4.5-Flash', 'GLM-4.7-Flash', 'Laguna M.1', 'GPT-OSS 120B', 'zeta']);
    expect($('beeknoeeModel').value).toBe('GLM-4.5-Flash');
  });

  it('missing key → legacy warning without the CORS suffix; network error → with it', async () => {
    render(<AiSettings />);
    open();
    await userEvent.click($('provBeeknoee'));
    await userEvent.click($('loadBeeknoeeModels'));
    expect($('beeknoeeModelStatus').textContent).toBe('⚠️ Nhập API key trước.');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.change($('beeknoeeKey'), { target: { value: 'bk' } });
    await userEvent.click($('loadBeeknoeeModels'));
    await vi.waitFor(() => expect($('beeknoeeModelStatus').textContent).toBe('⚠️ Failed to fetch (có thể do CORS nếu Beeknoee chặn gọi từ trình duyệt).'));
  });

  it('test model reports success / failure with the legacy texts', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}'));
    render(<AiSettings />);
    open();
    fireEvent.change($('geminiKey'), { target: { value: 'K' } });
    await userEvent.click($('testGeminiModel'));
    await vi.waitFor(() => expect($('geminiModelStatus').textContent).toBe('✓ Model “gemini-flash-latest” GỌI ĐƯỢC. Bấm Lưu để dùng.'));
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 }));
    await userEvent.click($('testGeminiModel'));
    await vi.waitFor(() =>
      expect($('geminiModelStatus').textContent).toBe('✗ “gemini-flash-latest” không gọi được: not found — chọn model khác rồi Thử lại.'),
    );
  });

  it('close, backdrop and Esc close the dialog', async () => {
    render(<AiSettings />);
    open();
    await userEvent.click($('closeSettings'));
    expect(useApp.getState().overlay).toBeNull();
    open();
    await userEvent.keyboard('{Escape}');
    expect(useApp.getState().overlay).toBeNull();
    open();
    await userEvent.click($('settingsOverlay'));
    expect(useApp.getState().overlay).toBeNull();
  });

  it('defaults are used when nothing is stored', () => {
    render(<AiSettings />);
    open();
    expect($('geminiModel').value).toBe(DEFAULT_AI_SETTINGS.geminiModel);
    expect($('provGemini').classList.contains('on')).toBe(true);
    expect($('freeAi').checked).toBe(true);
  });
});

describe('AiSettings async safety', () => {
  it('a model list that arrives after close + reopen does not touch the fresh form', async () => {
    let resolve!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(r => { resolve = r; }));
    render(<AiSettings />);
    open();
    await userEvent.click($('provBeeknoee'));
    fireEvent.change($('beeknoeeKey'), { target: { value: 'bk' } });
    await userEvent.click($('loadBeeknoeeModels'));
    await userEvent.keyboard('{Escape}');
    open();
    await act(async () => { resolve(new Response(JSON.stringify({ data: [{ id: 'late-model' }] }))); });
    await new Promise(r => setTimeout(r, 0));
    expect($('beeknoeeModel').value).toBe('');
    expect($('beeknoeeModelStatus').textContent).not.toContain('✓');
    expect([...document.querySelectorAll('#beeknoeeModelList option')].map(o => o.getAttribute('value'))).not.toContain('late-model');
  });

  it('reads the settings from the store (single source of truth)', () => {
    act(() => useApp.setState({ aiSettings: { ...DEFAULT_AI_SETTINGS, provider: 'ollama', ollamaModel: 'qwen3' } }));
    render(<AiSettings />);
    open();
    expect($('provOllama').classList.contains('on')).toBe(true);
    expect($('ollamaModel').value).toBe('qwen3');
  });
});

describe('AiSettings late results while closed', () => {
  it('a model list arriving while the box is closed is dropped, not shown on the next open', async () => {
    let resolve!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(r => { resolve = r; }));
    render(<AiSettings />);
    open();
    await userEvent.click($('provBeeknoee'));
    fireEvent.change($('beeknoeeKey'), { target: { value: 'bk' } });
    await userEvent.click($('loadBeeknoeeModels'));
    await userEvent.keyboard('{Escape}');
    await act(async () => { resolve(new Response(JSON.stringify({ data: [{ id: 'late-model' }] }))); });
    await new Promise(r => setTimeout(r, 0));
    open();
    expect([...document.querySelectorAll('#beeknoeeModelList option')].map(o => o.getAttribute('value'))).not.toContain('late-model');
  });
});
