import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { initialState, useApp } from '../../app/store';
import { cardText } from '../../core/cards';
import { setBurstSink } from '../../engines/burst';
import { firstSentence } from '../../core/yesno';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { YesNo } from './YesNo';
import type { YesNoDeps } from './yesnoDraw';

let db: CardsDb;
beforeAll(async () => { db = openCardsDb(await makeDb(deckCards), await sqlJs()); });

const W = 'Witches Tarot';
const noAi = { ...initialState().aiSettings, freeAi: false, geminiKey: '', zenmuxKey: '', beeknoeeKey: '', ollamaKey: '' };
/** rng: lần 1 chọn lá (index 0 = The Fool), lần 2 chọn chiều (rev khi < 0.5). */
const fix = (rev: boolean) => { const seq = [0, rev ? 0.1 : 0.9]; let i = 0; return () => seq[i++ % 2] as number; };

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: W, dbStatus: 'ready', aiSettings: noAi });
});
afterEach(() => { setBurstSink(null); });

const draw = async () => { await act(async () => { fireEvent.click(document.getElementById('yesnoBtn')!); }); };

describe('YesNo', () => {
  const fool = () => db.query({ deck: W })[0]!;

  it('without AI: local verdict and first sentence of the upright meaning', async () => {
    const deps: YesNoDeps = { rng: fix(false) };
    render(<YesNo deps={deps} />);
    await draw();
    expect(document.getElementById('yesnoResult')!.className).toBe('yesno-result show');
    expect(document.getElementById('ynVerdict')!.textContent).toBe('CÓ');
    expect(document.getElementById('ynVerdict')!.className).toBe('yn-verdict yes');
    expect(document.getElementById('ynWhy')!.textContent).toBe(firstSentence(cardText(fool(), 'vi', null).y_nghia_xuoi));
    expect(document.querySelector('.yn-card-name')!.textContent).toBe(fool().ten + ' (xuôi)');
    expect(document.querySelector('#yesnoResult img')!.className).toBe('');
  });

  it('reversed card: KHÔNG, rev image, lightbox on click', async () => {
    const deps: YesNoDeps = { rng: fix(true) };
    render(<YesNo deps={deps} />);
    await draw();
    expect(document.getElementById('ynVerdict')!.textContent).toBe('KHÔNG');
    const img = document.querySelector('#yesnoResult img') as HTMLImageElement;
    expect(img.className).toBe('rev');
    fireEvent.click(img);
    expect(useApp.getState().lightbox).toEqual({ url: fool().image_url, reversed: true });
  });

  it('with AI: spinner then parsed verdict, class and markdown body', async () => {
    useApp.setState({ aiSettings: { ...noAi, freeAi: true } });
    let release!: () => void;
    const chat = vi.fn(async (_m: unknown, cb: { onToken(t: string): void }) => {
      await new Promise<void>(r => { release = r; });
      cb.onToken('PHÁN QUYẾT: Không\nVì **đúng**.');
      return { provider: 'free' as const };
    });
    const deps: YesNoDeps = { rng: fix(false), chat: chat as never };
    render(<YesNo deps={deps} />);
    fireEvent.change(document.getElementById('yesnoQ')!, { target: { value: 'có nên?' } });
    await draw();
    expect(document.getElementById('ynVerdict')!.textContent).toBe('…');
    expect(document.getElementById('ynWhy')!.textContent).toContain('Đang hỏi AI…');
    expect(document.querySelector('#ynWhy .spinner')).not.toBeNull();
    await act(async () => { release(); });
    expect(document.getElementById('ynVerdict')!.textContent).toBe('KHÔNG');
    expect(document.getElementById('ynVerdict')!.className).toBe('yn-verdict no');
    expect(document.querySelector('#ynWhy strong')!.textContent).toBe('đúng');
  });

  it('AI error falls back to the local verdict with the error text', async () => {
    useApp.setState({ aiSettings: { ...noAi, freeAi: true } });
    const deps: YesNoDeps = { rng: fix(false), chat: (async () => { throw new Error('boom'); }) as never };
    render(<YesNo deps={deps} />);
    await draw();
    expect(document.getElementById('ynVerdict')!.textContent).toBe('CÓ');
    expect(document.getElementById('ynWhy')!.textContent)
      .toBe('⚠️ AI lỗi (boom). Tạm dùng phán quyết theo chiều lá: ' + firstSentence(fool().y_nghia_xuoi));
  });

  it('chips fill the question in the current language and focus; Enter draws', async () => {
    const deps: YesNoDeps = { rng: fix(false) };
    render(<YesNo deps={deps} />);
    const chip = document.querySelector('#ynChips .qchip') as HTMLElement;
    fireEvent.click(chip);
    const input = document.getElementById('yesnoQ') as HTMLInputElement;
    expect(input.value).toBe(chip.dataset.q);
    expect(document.activeElement).toBe(input);
    act(() => useApp.getState().setLang('en'));
    expect(chip.dataset.q).toBe(chip.dataset.qen); // data-q theo ngôn ngữ hiện tại (applyLang của bản cũ)
    fireEvent.click(chip);
    expect(input.value).toBe(chip.dataset.qen);
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(document.getElementById('ynVerdict')).not.toBeNull();
  });

  const aiOn = () => useApp.setState({ aiSettings: { ...noAi, freeAi: true } });
  /** Chat giả có thể hoãn: mỗi lần gọi đẩy một resolver vào hàng đợi. */
  const deferredChat = () => {
    const calls: { done(text: string): void }[] = [];
    const chat = (async (_m: unknown, cb: { onToken(t: string): void }) => {
      await new Promise<void>(r => calls.push({ done: text => { cb.onToken(text); r(); } }));
      return { provider: 'free' as const };
    }) as never;
    return { calls, chat };
  };

  it('bursts on every draw, even when the same card and orientation repeat', async () => {
    const burst = vi.fn();
    setBurstSink(burst);
    const deps: YesNoDeps = { rng: fix(false) };
    render(<YesNo deps={deps} />);
    await draw();
    await draw();
    expect(burst).toHaveBeenCalledTimes(2);
  });

  it('a late answer of an older draw does not overwrite the newer result', async () => {
    aiOn();
    const { calls, chat } = deferredChat();
    const deps: YesNoDeps = { rng: fix(false), chat };
    render(<YesNo deps={deps} />);
    await draw();
    await draw();
    expect(calls).toHaveLength(2);
    await act(async () => { calls[1]!.done('PHÁN QUYẾT: Có\nmới'); });
    expect(document.getElementById('ynVerdict')!.textContent).toBe('CÓ');
    await act(async () => { calls[0]!.done('PHÁN QUYẾT: Không\ncũ'); });
    expect(document.getElementById('ynVerdict')!.textContent).toBe('CÓ');
    expect(document.getElementById('ynWhy')!.textContent).toBe('mới');
  });

  it('unmounting while the AI is pending aborts quietly (no error, no state update)', async () => {
    aiOn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let fail!: (e: unknown) => void;
    const chat = (async (_m: unknown, _cb: unknown, ctx: { signal?: AbortSignal }) => {
      signal = ctx.signal;
      await new Promise((_r, rej) => { fail = rej; });
    }) as never;
    const deps: YesNoDeps = { rng: fix(false), chat };
    const { unmount } = render(<YesNo deps={deps} />);
    await draw();
    unmount();
    expect(signal!.aborted).toBe(true);
    await act(async () => { fail(new DOMException('aborted', 'AbortError')); });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('escapes markup in the AI body', async () => {
    aiOn();
    const { calls, chat } = deferredChat();
    const deps: YesNoDeps = { rng: fix(false), chat };
    render(<YesNo deps={deps} />);
    await draw();
    await act(async () => { calls[0]!.done('PHÁN QUYẾT: Có\n<img src=x onerror=alert(1)> <script>alert(2)</script>'); });
    const why = document.getElementById('ynWhy')!;
    expect(why.querySelector('img, script')).toBeNull();
    expect(why.textContent).toContain('<img src=x');
  });
});
