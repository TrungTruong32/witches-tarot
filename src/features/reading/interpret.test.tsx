import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../../tests/fixtures/deck';
import { makeDb, sqlJs } from '../../../tests/fixtures/makeDb';
import { fakeFetch } from '../../../tests/helpers/stream';
import { loadLegacy } from '../../../tests/legacy/harness';
import { initialState, useApp } from '../../app/store';
import { toSpreadCard } from '../../core/draw';
import { computeSpreadFacts, factLines } from '../../core/facts';
import { buildSystemPrompt, buildUserPrompt } from '../../core/prompt';
import { renderMarkdown } from '../../core/markdown';
import type { Card, Reading as ReadingRecord, SpreadCard } from '../../core/types';
import type { chatComplete, ChatCallbacks, ChatResult } from '../../services/ai/chat';
import type { ChatMessage } from '../../services/ai/providers';
import { openCardsDb, type CardsDb } from '../../services/cardsDb';
import { addReading, allReadings } from '../../services/idb';
import { cloudSaveReading } from '../../services/readingsApi';
import { aiBgKey, startAiCardsBg } from './aiCardsBg';
import { streamHtml } from './AiStream';
import { initialInterpret, runFollowUp, runInterpret, showLoadedAnswer, streamInto, useInterpret, type InterpretDeps, type StreamView } from './interpret';
import { Reading } from './Reading';
import { initialReading, majorNameLookup, useReading } from './readingStore';

const W = 'Witches Tarot';
const legacyHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'legacy', 'witches_tarot.legacy.html'), 'utf8');
const legacyDoc = new DOMParser().parseFromString(legacyHtml, 'text/html');
const legacyPanel = legacyDoc.getElementById('resultPanel')!;

let db: CardsDb;
beforeAll(async () => {
  db = openCardsDb(await makeDb(deckCards), await sqlJs());
});

const card = (ten: string, o: 'xuoi' | 'nguoc' = 'xuoi'): SpreadCard =>
  toSpreadCard({ ...(deckCards.find(c => c.deck === W && c.ten === ten) as Card), orientation: o });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tarotDeviceId', '0f8fad5b-d9cb-469f-a165-70867728950e');
  globalThis.indexedDB = new IDBFactory();
  useApp.setState({ ...initialState(), db, decks: db.decks(), deck: W, dbStatus: 'ready' });
  useReading.setState(initialReading());
  useInterpret.setState(initialInterpret());
  (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ cancel: vi.fn(), playbackRate: 1 }));
});
afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  vi.restoreAllMocks();
});

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const renderReading = () => render(<MemoryRouter><Reading /></MemoryRouter>);

/** Bước của một lượt chat giả. */
type Step = ['token' | 'reason', string] | ['switch'] | ['throw', string] | ['wait', Promise<void>];
interface FakeChat {
  chat: typeof chatComplete;
  calls: ChatMessage[][];
}
/** chatComplete giả: chạy lần lượt các bước, trả `result`. Mỗi lần gọi lấy một kịch bản trong `scripts`. */
function fakeChat(scripts: Step[][], result: ChatResult = { provider: 'free', free: { model: 'm', remaining: 4 } }): FakeChat {
  const calls: ChatMessage[][] = [];
  const chat = (async (messages: ChatMessage[], cb: ChatCallbacks) => {
    calls.push(messages.map(m => ({ ...m })));
    for (const s of scripts[calls.length - 1] ?? []) {
      if (s[0] === 'token') cb.onToken(s[1]);
      else if (s[0] === 'reason') cb.onReasoning?.(s[1]);
      else if (s[0] === 'switch') cb.onSwitch?.('gemini', 'free', new Error('503'));
      else if (s[0] === 'throw') throw new Error(s[1]);
      else await s[1];
    }
    return result;
  }) as typeof chatComplete;
  return { chat, calls };
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
const noCloud: InterpretDeps['cloud'] = () => {};

/** Trải 2 lá (đủ để có dữ kiện), kiểu trải 3 lá ppf → có vị trí. */
function setSpread() {
  useReading.setState({ question: '  Tình yêu?  ', spreadKey: 'ppf', cards: [card('The Fool'), card('Ace of Cups', 'nguoc'), card('The Tower')] });
}

describe('Result panel markup matches legacy', () => {
  it('same ids/classes, button texts and titles, initial hint, hidden tools and is-empty', () => {
    renderReading();
    const ours = $('resultPanel');
    const idCls = (root: Element) => [root, ...root.querySelectorAll('[id]')].map(e => e.id + '.' + [...e.classList].sort().join('.'));
    expect(idCls(ours)).toEqual(idCls(legacyPanel));
    const btn = (root: Element) => [...root.querySelectorAll('button')].map(b => [b.id, b.textContent, b.getAttribute('title'), (b as HTMLElement).style.display].join('|'));
    expect(btn(ours)).toEqual(btn(legacyPanel));
    for (const sel of ['#readingProvider', '#aiOutput', 'label'])
      expect(ours.querySelector(sel)!.textContent, sel).toBe(legacyPanel.querySelector(sel)!.textContent);
    const attrs = (root: Element) => [...root.querySelectorAll('textarea, #aiCardsBg, #aiQuota')].map(i =>
      ['id', 'maxlength', 'placeholder', 'aria-hidden', 'hidden'].map(a => i.getAttribute(a)).join('|'));
    expect(attrs(ours)).toEqual(attrs(legacyPanel));
    expect($('chatFollow').style.display).toBe('none');
    expect($('readingNoteWrap').style.display).toBe('none');
    expect($('readingNoteWrap').style.marginTop).toBe('14px');
    expect(ours.classList.contains('is-empty')).toBe(true);
  });

  it('initial hint follows the language (legacy applyLang)', () => {
    useApp.setState({ lang: 'en' });
    renderReading();
    expect($('aiOutput').textContent).toBe('Write your question, pick a spread, draw the cards, then tap “Interpret” — your reading will appear here.');
    expect($('readingNote').getAttribute('placeholder')).toBe('How does this reading feel? What happened afterwards?…');
  });

  it('#interpretBtn carries the legacy initIcons ball icon and a glyph-free label', () => {
    renderReading();
    const b = $('interpretBtn');
    expect(b.querySelector('svg.ico use')!.getAttribute('href')).toBe('#i-ball');
    expect(b.querySelector('.lbl')!.textContent).toBe('Diễn giải');
  });
});

describe('streamHtml matches legacy streamInto DOM step by step', () => {
  type LegacyStream = { streamInto(el: HTMLElement, msgs: unknown[]): Promise<string> };
  const scripts: Record<string, Step[]> = {
    'reasoning then tokens': [['reason', 'nghĩ <a>'], ['reason', ' tiếp'], ['token', '**Xin**'], ['reason', ' muộn'], ['token', ' chào\n- ý']],
    'switch then tokens': [['reason', 'x'], ['switch'], ['token', 'A *b*']],
    'switch, reasoning, then nothing': [['switch'], ['reason', 'chỉ nghĩ']],
    'nothing at all': [],
  };
  for (const lang of ['vi', 'en'] as const) {
    for (const [name, script] of Object.entries(scripts)) {
      it(`${name} (${lang})`, async () => {
        // Bản cũ: chạy streamInto thật với chatComplete giả, chụp innerHTML sau mỗi callback
        const legacySnaps: string[] = [];
        const legacyEl = document.createElement('div');
        const L = loadLegacy<LegacyStream>(['escapeHtml', 'renderMarkdown', 'streamInto'], {
          lang,
          providerLabel: (p: string) => p,
          console: { warn() {} },
          chatComplete: async (_m: unknown, onToken: (t: string) => void, onReasoning: (t: string) => void, onSwitch: (a: string, b: string, e: Error) => void) => {
            legacySnaps.push(legacyEl.innerHTML);
            for (const s of script) {
              if (s[0] === 'token') onToken(s[1]);
              else if (s[0] === 'reason') onReasoning(s[1]);
              else if (s[0] === 'switch') onSwitch('gemini', 'free', new Error('x'));
              legacySnaps.push(legacyEl.innerHTML);
            }
          },
        });
        legacyEl.className = 'ai-output ai-hint';
        await L.streamInto(legacyEl, []);
        legacySnaps.push(legacyEl.innerHTML);

        const views: StreamView[] = [];
        await streamInto([], v => views.push(v), fakeChat([script]).chat, { settings: useApp.getState().aiSettings, lang, deck: W });
        const norm = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.innerHTML; };
        // Bản cũ vẽ lại cả khi không đổi gì (suy nghĩ đến sau chữ đầu); so chuỗi các trạng thái khác nhau liên tiếp
        const dedupe = (xs: string[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
        expect(dedupe(views.map(v => norm(streamHtml(v, lang).html)))).toEqual(dedupe(legacySnaps));
        expect(streamHtml(views.at(-1)!, lang).hint).toBe(legacyEl.classList.contains('ai-hint'));
      });
    }
  }
});

describe('Interpret', () => {
  it('streams "Xin" + " chào" as markdown, sends [system, user] prompts and saves the legacy record shape', async () => {
    setSpread();
    renderReading();
    const gate = deferred();
    const f = fakeChat([[['reason', 'đang nghĩ'], ['wait', gate.promise], ['token', '**Xin**'], ['token', ' chào']]]);
    let run!: Promise<void>;
    await act(async () => { run = runInterpret({ chat: f.chat, cloud: noCloud }); });
    expect($('resultPanel').classList.contains('is-empty')).toBe(false);
    expect($('aiOutput').querySelector('.thinking')!.textContent).toBe(' ☿︎ Đang suy nghĩ…\n\nđang nghĩ');
    expect($<HTMLButtonElement>('interpretBtn').disabled).toBe(true);
    expect(useReading.getState().aiBg).toBe('thinking');
    await act(async () => { gate.resolve(); await run; });

    const cards = useReading.getState().cards;
    const majorName = majorNameLookup(db, cards);
    expect(f.calls[0]).toEqual([
      { role: 'system', content: buildSystemPrompt('vi', W) },
      { role: 'user', content: buildUserPrompt({ question: '  Tình yêu?  ', cards, spreadKey: 'ppf', positions: ['Quá khứ', 'Hiện tại', 'Tương lai'], lang: 'vi', cardEn: null, majorName }) },
    ]);
    expect($('aiOutput').querySelector('details.think-box summary')!.textContent).toBe('☿︎ Quá trình suy nghĩ của AI');
    expect($('aiOutput').innerHTML).toContain(renderMarkdown('**Xin** chào'));
    expect($('aiOutput').classList.contains('ai-hint')).toBe(false);

    const [saved] = await allReadings();
    const { ts, id, ...rest } = saved!;
    expect(typeof ts).toBe('number');
    expect(id).toBe(1);
    expect(rest).toEqual({
      deck: W, question: 'Tình yêu?', provider: 'free · m', text: '**Xin** chào', followups: [], note: '', spread: 'ppf',
      positions: ['Quá khứ', 'Hiện tại', 'Tương lai'],
      facts: factLines(cards, computeSpreadFacts(cards), 'vi', majorName),
      cards: cards.map(c => ({ id: c.id, deck: c.deck, ten: c.ten, bo: c.bo, so: c.so, y_nghia_xuoi: c.y_nghia_xuoi, nghia_nguoc: c.nghia_nguoc, tu_khoa: c.tu_khoa, image_url: c.image_url, orientation: c.orientation })),
    });
    expect(rest.facts!.length).toBeGreaterThan(0);

    expect($('chatFollow').style.display).toBe('block');
    expect($('ttsBtn').style.display).toBe('inline-block');
    expect($('shareImgBtn').style.display).toBe('inline-block');
    expect($('shareLinkBtn').style.display).toBe('inline-block');
    expect($('readingNoteWrap').style.display).toBe('block');
    expect($<HTMLButtonElement>('interpretBtn').disabled).toBe(false);
    expect(useReading.getState()).toMatchObject({ aiBg: 'done', answer: '**Xin** chào', provider: 'free' });
    expect(useReading.getState().messages.at(-1)).toEqual({ role: 'assistant', content: '**Xin** chào' });
  });

  it('free result with remaining 4: #aiQuota reads "Còn 4 lượt miễn phí hôm nay"; saved provider "free · m"', async () => {
    setSpread();
    renderReading();
    expect($('aiQuota').hidden).toBe(true);
    await act(() => runInterpret({ chat: fakeChat([[['token', 'ok']]]).chat, cloud: noCloud }));
    expect($('aiQuota').hidden).toBe(false);
    expect($('aiQuota').textContent).toBe('Còn 4 lượt miễn phí hôm nay');
    expect((await allReadings())[0]!.provider).toBe('free · m');
    act(() => useApp.setState({ lang: 'en' }));
    expect($('aiQuota').textContent).toBe('4 free readings left today');
    expect($('readingProvider').textContent).toBe('✦︎ Your reading');
  });

  it('a BYOK provider saves providerLabel(p); no model from the free AI → "free · ?"', async () => {
    setSpread();
    await runInterpret({ chat: fakeChat([[['token', 'a']]], { provider: 'gemini' }).chat, cloud: noCloud });
    useInterpret.setState(initialInterpret());
    await runInterpret({ chat: fakeChat([[['token', 'b']]], { provider: 'free' }).chat, cloud: noCloud });
    expect((await allReadings()).map(r => r.provider)).toEqual(['Gemini (gemini-flash-latest)', 'free · ?']);
  });

  it('Review Focus 3: onSwitch then stream → .fallback-note shows and the answer is saved', async () => {
    setSpread();
    renderReading();
    await act(() => runInterpret({ chat: fakeChat([[['reason', 'r1'], ['switch'], ['token', 'Đáp']]]).chat, cloud: noCloud }));
    expect($('aiOutput').querySelector('.fallback-note')!.textContent).toBe('⏳ AI đang bận — đang chuyển sang máy dự phòng…');
    expect($('aiOutput').querySelector('.think-box')).toBeNull(); // suy nghĩ của provider lỗi bị bỏ
    expect((await allReadings()).map(r => r.text)).toEqual(['Đáp']);
  });

  it('Review Focus 3: throw after a token → "⚠️ Lỗi:" (fallback note kept), nothing saved, #interpretBtn enabled again', async () => {
    setSpread();
    renderReading();
    const save = vi.fn(addReading);
    await act(() => runInterpret({ chat: fakeChat([[['switch'], ['token', 'nửa câu'], ['throw', 'boom']]]).chat, save, cloud: noCloud }));
    const out = $('aiOutput');
    expect(out.classList.contains('ai-hint')).toBe(true);
    expect(out.querySelector('.fallback-note')).not.toBeNull();
    expect(out.textContent).toBe('⏳ AI đang bận — đang chuyển sang máy dự phòng…⚠️ Lỗi: boom');
    expect(save).not.toHaveBeenCalled();
    expect(await allReadings()).toEqual([]);
    expect($<HTMLButtonElement>('interpretBtn').disabled).toBe(false);
    expect($('chatFollow').style.display).toBe('none');
    expect($('ttsBtn').style.display).toBe('none');
    expect($('resultPanel').classList.contains('is-empty')).toBe(false);
    expect(useReading.getState().aiBg).toBe('done');
  });

  it('a model-not-found error adds the legacy "change model" hint', async () => {
    setSpread();
    renderReading();
    await act(() => runInterpret({ chat: fakeChat([[['throw', 'models/x is not found']]]).chat, cloud: noCloud }));
    expect($('aiOutput').textContent).toMatch(/^⚠️ Lỗi: models\/x is not found\n\n→ Model này không dùng được/);
  });

  it('an empty answer shows the legacy hint text and saves nothing', async () => {
    setSpread();
    renderReading();
    await act(() => runInterpret({ chat: fakeChat([[['reason', 'nghĩ mãi']]]).chat, cloud: noCloud }));
    expect($('aiOutput').textContent).toBe('(AI đã suy nghĩ nhưng chưa kịp xuất câu trả lời — có thể hết hạn mức token. Thử lại hoặc chọn model khác.)');
    expect($('aiOutput').classList.contains('ai-hint')).toBe(true);
    expect(await allReadings()).toEqual([]);
    expect($('chatFollow').style.display).toBe('none');
  });

  it('IndexedDB failure: no note box, cloud save still attempted (legacy saveReading)', async () => {
    setSpread();
    renderReading();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cloud = vi.fn();
    await act(() => runInterpret({ chat: fakeChat([[['token', 'x']]]).chat, save: () => Promise.reject(new Error('quota')), cloud }));
    expect(cloud).toHaveBeenCalledTimes(1);
    expect($('readingNoteWrap').style.display).toBe('none');
    expect($('chatFollow').style.display).toBe('block');
  });

  it('cloudSaveReading is called on every save; it sends nothing when prefs.cloudSave is off, and POSTs when on', async () => {
    setSpread();
    const ff = fakeFetch(() => new Response(null, { status: 200 }));
    const cloud: InterpretDeps['cloud'] = (r, l) => cloudSaveReading(r, l, ff.fetch);
    useApp.getState().setPref('cloudSave', false);
    await runInterpret({ chat: fakeChat([[['token', 'x']]]).chat, cloud });
    expect(ff.calls).toEqual([]);
    useApp.getState().setPref('cloudSave', true);
    useInterpret.setState(initialInterpret());
    await runInterpret({ chat: fakeChat([[['token', 'y']]]).chat, cloud });
    expect(ff.calls.map(c => c.url)).toEqual(['/api/readings']);
    expect((ff.calls[0]!.body as { ai_answer: string; model: string }).ai_answer).toBe('y');
  });

  it('the button runs the real flow (no AI configured stub: fetch pending) and scrolls #resultPanel in a rAF', async () => {
    setSpread();
    renderReading();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 1; });
    await act(async () => { fireEvent.click($('interpretBtn')); });
    expect(raf).toHaveBeenCalled();
    const i = scroll.mock.contexts.indexOf($('resultPanel'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(scroll.mock.calls[i]![0]).toEqual({ behavior: 'smooth', block: 'start' });
    expect($('aiOutput').innerHTML).toBe('<span class="spinner"></span> Đang kết nối…');
    expect($<HTMLButtonElement>('interpretBtn').disabled).toBe(true);
  });
});

describe('Follow-up', () => {
  const interpretFirst = async (scripts: Step[][]) => {
    setSpread();
    renderReading();
    const f = fakeChat([[['token', 'Lời giải']], ...scripts]);
    await act(() => runInterpret({ chat: f.chat, cloud: noCloud }));
    return f;
  };

  it('Enter sends: appends .chat-q "☌︎ q" and .chat-a, the chat gets the history, the IDB record gains followups:[{q,a}]', async () => {
    const f = await interpretFirst([[['token', 'Đáp *tiếp*']]]);
    const input = $<HTMLTextAreaElement>('chatInput');
    fireEvent.change(input, { target: { value: 'Shift' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(f.calls).toHaveLength(1); // Shift+Enter chỉ xuống dòng
    fireEvent.change(input, { target: { value: '  Còn gì nữa?  ' } });
    // Gắn chat giả cho lượt hỏi tiếp: gọi trực tiếp như ô nhập (Enter → runFollowUp), deps tiêm qua tham số
    await act(() => runFollowUp(input.value, { chat: f.chat }));
    expect(f.calls[1]!.slice(-2)).toEqual([{ role: 'assistant', content: 'Lời giải' }, { role: 'user', content: 'Còn gì nữa?' }]);
    const log = $('chatLog');
    expect([...log.children].map(e => e.className)).toEqual(['chat-q', 'chat-a ai-output']);
    expect(log.querySelector('.chat-q')!.textContent).toBe('☌︎ Còn gì nữa?');
    expect(log.querySelector('.chat-a')!.innerHTML).toBe(renderMarkdown('Đáp *tiếp*'));
    expect((await allReadings())[0]!.followups).toEqual([{ q: 'Còn gì nữa?', a: 'Đáp *tiếp*' }]);
    expect(useReading.getState().followups).toEqual([{ q: 'Còn gì nữa?', a: 'Đáp *tiếp*' }]);
    expect(useReading.getState().messages.slice(-2)).toEqual([{ role: 'user', content: 'Còn gì nữa?' }, { role: 'assistant', content: 'Đáp *tiếp*' }]);
  });

  it('the Enter key path clears the input and calls runFollowUp (real chat → pending fetch)', async () => {
    await interpretFirst([]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    const input = $<HTMLTextAreaElement>('chatInput');
    fireEvent.change(input, { target: { value: 'Hỏi' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(input.value).toBe('');
    expect($('chatLog').querySelector('.chat-q')!.textContent).toBe('☌︎ Hỏi');
    expect($<HTMLButtonElement>('chatSend').disabled).toBe(true);
  });

  it('failure pops the user message and shows "⚠️ Lỗi:"; nothing is added to followups', async () => {
    const f = await interpretFirst([[['throw', 'mạng']]]);
    const before = useReading.getState().messages;
    await act(() => runFollowUp('Hỏi?', { chat: f.chat }));
    const a = $('chatLog').querySelector('.chat-a')!;
    expect(a.className).toBe('chat-a ai-output ai-hint');
    expect(a.textContent).toBe('⚠️ Lỗi: mạng');
    expect(useReading.getState().messages).toEqual(before);
    expect((await allReadings())[0]!.followups).toEqual([]);
    expect($<HTMLButtonElement>('chatSend').disabled).toBe(false);
  });

  it('a follow-up still streaming when a new interpret starts does not write into the new reading', async () => {
    const gate = deferred();
    const f = await interpretFirst([[['wait', gate.promise], ['token', 'cũ']], [['token', 'Lời giải mới']]]);
    let follow!: Promise<void>;
    await act(async () => { follow = runFollowUp('Hỏi cũ', { chat: f.chat }); });
    await act(() => runInterpret({ chat: f.chat, cloud: noCloud }));
    await act(async () => { gate.resolve(); await follow; });
    expect(useReading.getState().followups).toEqual([]);
    expect(useReading.getState().messages.map(m => m.content).slice(-1)).toEqual(['Lời giải mới']);
    expect((await allReadings()).map(r => r.followups)).toEqual([[], []]);
    expect($('chatLog').children).toHaveLength(0);
  });
});

describe('Reading note', () => {
  it('typing saves after 500 ms (debounced) with the legacy status texts; follow-ups keep the note', async () => {
    setSpread();
    renderReading();
    const f = fakeChat([[['token', 'x']], [['token', 'y']]]);
    await act(() => runInterpret({ chat: f.chat, cloud: noCloud }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const note = $<HTMLTextAreaElement>('readingNote');
    fireEvent.change(note, { target: { value: 'Ghi' } });
    fireEvent.change(note, { target: { value: 'Ghi chú' } });
    expect($('readingNoteStatus').textContent).toBe('Đang lưu…');
    await act(async () => { await vi.advanceTimersByTimeAsync(499); });
    expect((await allReadings())[0]!.note).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    vi.useRealTimers();
    await vi.waitFor(async () => expect((await allReadings())[0]!.note).toBe('Ghi chú'));
    expect($('readingNoteStatus').textContent).toBe('✓ Đã lưu');
    await act(() => runFollowUp('q', { chat: f.chat }));
    expect((await allReadings())[0]).toMatchObject({ note: 'Ghi chú', followups: [{ q: 'q', a: 'y' }] });
  });

  it('a failed save shows "⚠️ Lưu thất bại: …"', async () => {
    setSpread();
    renderReading();
    await act(() => runInterpret({ chat: fakeChat([[['token', 'x']]]).chat, cloud: noCloud }));
    globalThis.indexedDB = { open: () => { throw new Error('hỏng'); } } as unknown as IDBFactory;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change($('readingNote'), { target: { value: 'n' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect($('readingNoteStatus').textContent).toBe('⚠️ Lưu thất bại: hỏng');
  });
});

describe('TTS', () => {
  it('reads #aiOutput text with vi-VN (Vietnamese voice if any); clicking while speaking cancels', async () => {
    const synth = { speaking: false, speak: vi.fn(), cancel: vi.fn(), getVoices: () => [{ lang: 'en-US' }, { lang: 'vi-VN', name: 'Linh' }] };
    class Utter { lang = ''; rate = 0; pitch = 0; voice: unknown = null; constructor(public text: string) {} }
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', Utter);
    try {
      setSpread();
      renderReading();
      await act(() => runInterpret({ chat: fakeChat([[['token', '**Lời** giải']]]).chat, cloud: noCloud }));
      expect(synth.cancel).toHaveBeenCalledTimes(1); // bắt đầu lượt mới thì dừng giọng đọc cũ
      fireEvent.click($('ttsBtn'));
      const u = synth.speak.mock.calls[0]![0] as Utter;
      expect(u).toMatchObject({ text: 'Lời giải', lang: 'vi-VN', rate: 1, pitch: 1, voice: { lang: 'vi-VN', name: 'Linh' } });
      synth.speaking = true;
      fireEvent.click($('ttsBtn'));
      expect(synth.cancel).toHaveBeenCalledTimes(2);
      expect(synth.speak).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Floating cards (#aiCardsBg)', () => {
  it('engine: one .aibg-card per card (max 12) with image attrs; thinking lights cards in turn; stop cancels and empties', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const box = document.createElement('div');
    box.className = 'ai-cards-bg';
    const anim = { cancel: vi.fn(), playbackRate: 1 };
    (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => anim);
    const cards = [card('The Fool'), card('Karma', 'nguoc'), ...Array.from({ length: 12 }, () => card('The Tower'))];
    const bg = startAiCardsBg(box, cards, false, () => 0.5);
    expect(box.children).toHaveLength(12);
    const img = box.querySelectorAll('img')[1]!;
    expect([img.getAttribute('src'), img.className, img.getAttribute('alt'), img.getAttribute('loading'), img.getAttribute('decoding')])
      .toEqual([cards[1]!.image_url, 'rev', '', 'eager', 'async']);
    expect((box.children[0] as HTMLElement).style.getPropertyValue('--w')).toBe('78px');
    bg.mode('thinking');
    expect(box.className).toBe('ai-cards-bg on thinking');
    expect(anim.playbackRate).toBe(2.4);
    expect(box.children[0]!.classList.contains('lit')).toBe(true);
    vi.advanceTimersByTime(1500);
    expect([...box.children].map(e => e.classList.contains('lit')).indexOf(true)).toBe(1);
    bg.mode('done');
    expect(box.className).toBe('ai-cards-bg on done');
    expect(box.querySelector('.lit')).toBeNull();
    bg.stop();
    expect(anim.cancel).toHaveBeenCalledTimes(12);
    expect(box.children).toHaveLength(0);
    expect(box.className).toBe('ai-cards-bg');
  });

  it('reduced motion: no animation, a static rotation; aiBgKey marks reversed cards', () => {
    const box = document.createElement('div');
    startAiCardsBg(box, [card('The Fool')], true, () => 0.75);
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect((box.children[0] as HTMLElement).style.transform).toBe('rotate(6deg)');
    const c = [card('The Fool'), card('Karma', 'nguoc')];
    expect(aiBgKey(c)).toBe(`${c[0]!.id}|${c[1]!.id}r`);
  });

  it('panel follows aiBg: built on interpret, rebuilt on spread change, cleared with the spread and stopped on unmount', async () => {
    setSpread();
    const view = renderReading();
    expect($('aiCardsBg').children).toHaveLength(0);
    await act(() => runInterpret({ chat: fakeChat([[['token', 'x']]]).chat, cloud: noCloud }));
    expect($('aiCardsBg').children).toHaveLength(3);
    expect($('aiCardsBg').className).toBe('ai-cards-bg on done');
    expect($('aiSection').classList.contains('bg-on')).toBe(true);
    const first = $('aiCardsBg').children[0];
    act(() => useReading.setState({ question: 'khác' })); // trải bài không đổi → không dựng lại
    expect($('aiCardsBg').children[0]).toBe(first);
    act(() => useReading.getState().removeCard(useReading.getState().cards[0]!.uid!));
    expect($('aiCardsBg').children).toHaveLength(2);
    expect($('aiCardsBg').className).toBe('ai-cards-bg on done');
    act(() => useReading.getState().clear());
    expect($('aiCardsBg').children).toHaveLength(0);
    expect($('aiSection').classList.contains('bg-on')).toBe(false);
    act(() => useReading.setState({ cards: [card('The Fool')], aiBg: 'done' }));
    const anims = (Element.prototype.animate as unknown as { mock: { results: { value: { cancel: ReturnType<typeof vi.fn> } }[] } }).mock.results;
    const last = anims.at(-1)!.value;
    view.unmount();
    expect(last.cancel).toHaveBeenCalled();
  });
});

describe('showLoadedAnswer (API for Task 8)', () => {
  it('shows the text as a finished answer, the share buttons, no chat; a record with id gets the note box', () => {
    useReading.setState({ cards: [card('The Fool')] });
    renderReading();
    const rec = { id: 7, ts: 1, deck: W, question: 'q', provider: 'p', text: '**A**', note: 'cũ', cards: [] } as ReadingRecord;
    act(() => showLoadedAnswer('**A**', rec));
    expect($('aiOutput').innerHTML).toBe(renderMarkdown('**A**'));
    expect($('shareImgBtn').style.display).toBe('inline-block');
    expect($('chatFollow').style.display).toBe('none');
    expect($('readingNoteWrap').style.display).toBe('block');
    expect($<HTMLTextAreaElement>('readingNote').value).toBe('cũ');
    expect(useReading.getState()).toMatchObject({ answer: '**A**', messages: [], aiBg: 'done', current: rec });
    act(() => showLoadedAnswer('B', null));
    expect($('readingNoteWrap').style.display).toBe('none');
  });
});
