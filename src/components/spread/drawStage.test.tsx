import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deckCards } from '../../../tests/fixtures/deck';
import { initialState, useApp } from '../../app/store';
import type { CardsDb } from '../../services/cardsDb';
import { DrawStage, type DrawStageHandle } from './DrawStage';
import { claimDraw, isLive, releaseDraw } from './drawSession';
import { RitualOverlay } from './RitualOverlay';

const W = 'Witches Tarot';
const fakeDb = {
  query: ({ deck }: { deck: string | null }) => deckCards.filter(c => !deck || c.deck === deck),
  count: (deck: string) => deckCards.filter(c => c.deck === deck).length,
} as unknown as CardsDb;

const animStub = () => ({ cancel: vi.fn() });
let realMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), db: fakeDb, deck: W, dbStatus: 'ready' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(animStub);
  realMatchMedia = window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  window.matchMedia = realMatchMedia as typeof window.matchMedia;
  vi.restoreAllMocks();
});

const stubReduce = () => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
};
const ritualOff = () => act(() => useApp.getState().setPref('ritualOff', true));
const $ = (id: string) => document.getElementById(id) as HTMLElement;

const doneMsg = (k: number) => 'xong ' + k;
const stage = (ctx: 'draw' | 'reading', over: Partial<Parameters<typeof DrawStage>[0]> = {}) => (
  <DrawStage ctx={ctx} count={3} question="q" onStart={() => {}} onPicked={() => {}} doneMsg={doneMsg} {...over} />
);

describe('drawSession', () => {
  it('claim cancels the previous holder, release only frees its own token', () => {
    const c1 = vi.fn(), c2 = vi.fn();
    const t1 = claimDraw(c1);
    expect(isLive(t1)).toBe(true);
    const t2 = claimDraw(c2);
    expect(c1).toHaveBeenCalledTimes(1);
    expect(isLive(t1)).toBe(false);
    releaseDraw(t1);
    expect(isLive(t2)).toBe(true);
    releaseDraw(t2);
    expect(isLive(t2)).toBe(false);
    expect(c2).not.toHaveBeenCalled();
  });
});

describe('DrawStage ritual', () => {
  it('opens #ritualOverlay with the quoted question; Start begins the shuffle', () => {
    render(<><RitualOverlay />{stage('draw')}</>);
    expect($('ritualOverlay').style.display).toBe('none');
    fireEvent.click($('drawBtn'));
    expect($('ritualOverlay').style.display).toBe('flex');
    expect($('ritualQ').textContent).toBe('“q”');
    expect($('drawOrbit').classList.contains('on')).toBe(false);
    fireEvent.click($('ritualStart'));
    expect($('ritualOverlay').style.display).toBe('none');
    expect(document.querySelector('#drawOrbit.riffle.on')).not.toBeNull();
    expect(localStorage.getItem('tarotRitual')).toBeNull();
  });

  it('"don\'t show again" persists tarotRitual=0 and later draws skip the ritual', () => {
    render(<><RitualOverlay />{stage('draw')}</>);
    fireEvent.click($('pickBtn'));
    fireEvent.click($('ritualDisable'));
    fireEvent.click($('ritualStart'));
    expect(localStorage.getItem('tarotRitual')).toBe('0');
    expect(useApp.getState().prefs.ritualOff).toBe(true);
    fireEvent.click($('stopShuffle'));
    fireEvent.click($('drawBtn'));
    expect($('ritualOverlay').style.display).toBe('none');
    expect($('drawOrbit').classList.contains('on')).toBe(true);
  });

  it('Skip starts the draw without persisting; empty question shows no quote', () => {
    render(<><RitualOverlay />{stage('reading', { question: '  ' })}</>);
    fireEvent.click($('spreadPickBtn'));
    expect($('ritualQ').textContent).toBe('');
    fireEvent.click($('ritualSkip'));
    expect($('spreadOrbit').classList.contains('on')).toBe(true);
    expect(localStorage.getItem('tarotRitual')).toBeNull();
  });

  it('unmounting the stage while its ritual is open closes the ritual', () => {
    const r = render(<><RitualOverlay />{stage('draw')}</>);
    fireEvent.click($('drawBtn'));
    r.rerender(<><RitualOverlay /></>);
    expect(useApp.getState().ritual).toBeNull();
    expect($('ritualOverlay').style.display).toBe('none');
  });
});

describe('DrawStage pick flow', () => {
  it('reduced motion: ✋ shows the wheel; 3 taps → onPicked(3 cards) and status = doneMsg(3)', () => {
    ritualOff();
    stubReduce();
    const onStart = vi.fn(), onPicked = vi.fn();
    render(stage('draw', { onStart, onPicked }));
    fireEvent.click($('pickBtn'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect($('drawOrbit').classList.contains('on')).toBe(false);
    expect($('drawFan').style.display).toBe('block');
    expect($('pickStatus').style.display).toBe('block');
    const wc = document.querySelectorAll<HTMLElement>('#drawFan .wcard');
    expect(wc.length).toBe(deckCards.filter(c => c.deck === W).length);
    fireEvent.click(wc[0]!);
    fireEvent.click(wc[4]!);
    expect(onPicked).not.toHaveBeenCalled();
    fireEvent.click(wc[2]!);
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked.mock.calls[0]![0]).toHaveLength(3);
    expect($('pickStatus').textContent).toBe('xong 3');
  });

  it('shuffle locks the draw buttons and shows Stop; Stop runs the auto wheel and reads count at that time', () => {
    ritualOff();
    const onPicked = vi.fn();
    const r = render(stage('reading', { onPicked, count: 2 }));
    fireEvent.click($('spreadDrawBtn'));
    expect(($('spreadDrawBtn') as HTMLButtonElement).disabled).toBe(true);
    expect(($('spreadPickBtn') as HTMLButtonElement).disabled).toBe(true);
    expect($('spreadStopShuffle').style.display).toBe('inline-block');
    r.rerender(stage('reading', { onPicked, count: 4 }));
    fireEvent.click($('spreadStopShuffle'));
    expect($('spreadOrbit').classList.contains('on')).toBe(false);
    expect($('spreadOrbit').innerHTML).toBe('');
    expect(($('spreadDrawBtn') as HTMLButtonElement).disabled).toBe(false);
    expect($('spreadStopShuffle').style.display).toBe('none');
    act(() => vi.advanceTimersByTime(20000));
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked.mock.calls[0]![0]).toHaveLength(4);
    expect($('spreadPickStatus').textContent).toBe('xong 4');
  });

  it('hideFan() hides the fan', () => {
    ritualOff();
    stubReduce();
    const ref = { current: null as DrawStageHandle | null };
    render(<DrawStage ref={ref} ctx="draw" count={1} question="" onStart={() => {}} onPicked={() => {}} doneMsg={doneMsg} />);
    fireEvent.click($('pickBtn'));
    expect($('drawFan').style.display).toBe('block');
    act(() => ref.current!.hideFan());
    expect($('drawFan').style.display).toBe('none');
  });
});

describe('DrawStage one draw at a time (Review Focus 1)', () => {
  it('starting reading resets the shuffling draw orbit', () => {
    ritualOff();
    render(<>{stage('draw')}{stage('reading')}</>);
    fireEvent.click($('drawBtn'));
    expect($('drawOrbit').classList.contains('on')).toBe(true);
    fireEvent.click($('spreadDrawBtn'));
    expect($('drawOrbit').classList.contains('on')).toBe(false);
    expect($('drawOrbit').innerHTML).toBe('');
    expect($('stopShuffle').style.display).toBe('none');
    expect(($('drawBtn') as HTMLButtonElement).disabled).toBe(false);
    expect($('spreadOrbit').classList.contains('on')).toBe(true);
  });

  it('a cancelled draw wheel never calls onPicked; unmounting reading mid-wheel leaves no timers', () => {
    ritualOff();
    const drawPicked = vi.fn(), readingPicked = vi.fn();
    render(stage('draw', { onPicked: drawPicked }));
    const rr = render(stage('reading', { onPicked: readingPicked }));
    fireEvent.click($('drawBtn'));
    fireEvent.click($('stopShuffle')); // bánh xe tự rút của Bốc bài đang chạy
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click($('spreadDrawBtn'));
    act(() => vi.advanceTimersByTime(20000));
    expect(drawPicked).not.toHaveBeenCalled();
    fireEvent.click($('spreadStopShuffle'));
    act(() => vi.advanceTimersByTime(800)); // giữa bánh xe
    expect(readingPicked).not.toHaveBeenCalled();
    rr.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(drawPicked).not.toHaveBeenCalled();
  });

  it('unmounting mid-shuffle leaves no timers', () => {
    ritualOff();
    const r = render(stage('draw'));
    fireEvent.click($('drawBtn'));
    act(() => vi.advanceTimersByTime(1000));
    r.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('DrawStage before the DB is ready', () => {
  it('disables both draw buttons; clicks claim nothing and call no onStart; enables once ready', () => {
    useApp.setState({ db: null, dbStatus: 'loading' });
    const onStart = vi.fn();
    render(stage('draw', { onStart }));
    const held = vi.fn();
    const tk = claimDraw(held);
    expect(($('drawBtn') as HTMLButtonElement).disabled).toBe(true);
    expect(($('pickBtn') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click($('drawBtn'));
    fireEvent.click($('pickBtn'));
    expect(onStart).not.toHaveBeenCalled();
    expect(useApp.getState().ritual).toBeNull();
    expect(held).not.toHaveBeenCalled(); // không giành chỗ của lượt đang giữ
    expect(isLive(tk)).toBe(true);
    releaseDraw(tk);
    act(() => useApp.setState({ db: fakeDb, dbStatus: 'ready' }));
    expect(($('drawBtn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('beginDraw guard: dbStatus not ready → nothing starts even if the click lands', () => {
    useApp.setState({ dbStatus: 'loading' }); // db có nhưng chưa "ready"
    act(() => useApp.getState().setPref('ritualOff', true));
    const onStart = vi.fn();
    render(stage('draw', { onStart }));
    // gọi thẳng handler React (bỏ qua thuộc tính disabled)
    const btn = $('drawBtn') as HTMLButtonElement;
    const key = Object.keys(btn).find(k => k.startsWith('__reactProps'))!;
    act(() => (btn as unknown as Record<string, { onClick(): void }>)[key]!.onClick());
    expect(onStart).not.toHaveBeenCalled();
    expect($('drawOrbit').classList.contains('on')).toBe(false);
  });
});

describe('DrawStage labels and scroll (§5.8)', () => {
  it('EN shows the renamed buttons, each with its hint line, for both ctxs', () => {
    useApp.setState({ lang: 'en' });
    render(<>{stage('draw')}{stage('reading')}</>);
    for (const [auto, pick] of [['drawBtn', 'pickBtn'], ['spreadDrawBtn', 'spreadPickBtn']] as const) {
      expect($(auto).textContent).toBe('🎲 Draw for me');
      expect($(auto).parentElement!.querySelector('.hint')!.textContent).toBe('The deck shuffles and draws for you.');
      expect($(pick).textContent).toBe('✋ Pick my own cards');
      expect($(pick).parentElement!.querySelector('.hint')!.textContent).toBe('After the shuffle, tap each card on the wheel.');
    }
    expect($('drawBtn').closest('.draw-controls')).not.toBeNull();
    expect($('spreadDrawBtn').closest('.draw-row')).not.toBeNull();
    expect($('stopShuffle').textContent).toBe('✕︎ Stop');
    expect($('spreadStopShuffle').textContent).toBe('✕︎ Stop shuffling');
  });

  it('VI labels', () => {
    render(stage('draw'));
    expect($('drawBtn').textContent).toBe('🎲 Máy bốc ngẫu nhiên');
    expect($('pickBtn').textContent).toBe('✋ Tự tay chọn lá');
  });

  it('scrolls the orbit into view when the Draw shuffle starts', () => {
    ritualOff();
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(stage('draw'));
    fireEvent.click($('drawBtn'));
    expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(spy.mock.contexts[0]).toBe($('drawOrbit'));
  });

  it('reduced motion (no shuffle): scrolls the visible wheel with behavior auto', () => {
    ritualOff();
    stubReduce();
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(stage('draw'));
    fireEvent.click($('pickBtn'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    expect(spy.mock.contexts[0]).toBe($('drawFan'));
  });

  it('AI Reading keeps legacy behaviour: no scroll when its shuffle starts', () => {
    ritualOff();
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(stage('reading'));
    fireEvent.click($('spreadDrawBtn'));
    expect($('spreadOrbit').classList.contains('on')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('renders leading/trailing slots inside the row', () => {
    render(stage('draw', { leading: <label id="lead">x</label>, trailing: <button id="trail">y</button> }));
    const row = document.querySelector('.draw-controls')!;
    // Bố cục chia hàng (số lá / hai nút bốc / hàng phụ): kiểm thứ tự trong cả hàng thay vì con trực tiếp
    const ids = Array.from(row.querySelectorAll('[id]')).map(e => e.id);
    expect(ids).toEqual(['lead', 'drawBtn', 'pickBtn', 'stopShuffle', 'trail']);
  });
});
