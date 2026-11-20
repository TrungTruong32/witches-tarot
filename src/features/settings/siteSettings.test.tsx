import { act, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, useApp } from '../../app/store';
import { CARD_BACK_KEYS, cardBackCss } from '../../core/cardBacks';
import { SiteSettings } from './SiteSettings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const openSite = () => act(() => useApp.getState().openOverlay('site'));

beforeEach(() => {
  localStorage.clear();
  useApp.setState({ ...initialState(), cardEn: null });
});

describe('SiteSettings', () => {
  it('opens from the store and closes with Done, the backdrop and Esc', async () => {
    render(<SiteSettings />);
    expect($('siteOverlay').classList.contains('open')).toBe(false);
    openSite();
    expect($('siteOverlay').classList.contains('open')).toBe(true);
    await userEvent.click($('closeSite'));
    expect($('siteOverlay').classList.contains('open')).toBe(false);
    openSite();
    await userEvent.click($('siteOverlay'));
    expect(useApp.getState().overlay).toBeNull();
    openSite();
    await userEvent.keyboard('{Escape}');
    expect(useApp.getState().overlay).toBeNull();
  });

  it('every control persists its legacy key and value format', async () => {
    render(<SiteSettings />);
    openSite();
    await userEvent.selectOptions($('themeSel'), 'night');
    await userEvent.click($('siteFx')); // on → off
    await userEvent.click($('siteRitual')); // shown → hidden
    await userEvent.click($('siteSound')); // on → off
    fireEvent.change($('siteSoundVol'), { target: { value: '30' } });
    await userEvent.selectOptions($('ambientMode'), 'candle');
    fireEvent.change($('ambientVol'), { target: { value: '20' } });
    await userEvent.click($('siteCloud')); // on → off
    expect({ ...localStorage }).toMatchObject({
      theme: 'night', tarotFx: '0', tarotRitual: '0', tarotSound: '0', tarotSoundVol: '0.3', tarotAmbientMode: 'candle', tarotAmbientVol: '0.2',
      tarotCloudSave: '0',
    });
  });

  it('the city row shows only for the real sky, with the legacy hint text', async () => {
    render(<SiteSettings />);
    openSite();
    expect($('skyCityRow').style.display).toBe('none');
    expect($('skyHint').textContent).toBe('Sao lấp lánh ngẫu nhiên để trang trí.');
    await userEvent.selectOptions($('skyMode'), 'real');
    await userEvent.selectOptions($('skyCity'), 'danang');
    expect($('skyCityRow').style.display).toBe('flex');
    expect($('skyHint').textContent).toBe('Vẽ bầu trời thật trên Đà Nẵng làm nền. Muốn bản đồ tương tác kéo được, mở mục “Thiên văn” trong menu.');
    expect({ ...localStorage }).toMatchObject({ tarotSkyMode: 'real', tarotSkyCity: 'danang' });
  });

  it('card back: grid and select stay in sync, legacy alias "plain" selects "sacred"', async () => {
    localStorage.setItem('cardBack', 'plain');
    useApp.setState(initialState());
    render(<SiteSettings />);
    openSite();
    expect(($('cardBackSel') as HTMLSelectElement).value).toBe('sacred');
    const opts = [...document.querySelectorAll('#cardBackGrid .cb-opt')];
    expect(opts.map(o => o.getAttribute('data-k'))).toEqual([...CARD_BACK_KEYS]);
    expect(document.querySelector('#cardBackGrid .cb-opt.on')!.getAttribute('data-k')).toBe('sacred');
    await userEvent.click(document.querySelector('#cardBackGrid .cb-opt[data-k="eye"]')!);
    expect(localStorage.getItem('cardBack')).toBe('eye');
    expect(($('cardBackSel') as HTMLSelectElement).value).toBe('eye');
    expect(document.querySelector('#cardBackGrid .cb-opt.on')!.getAttribute('data-k')).toBe('eye');
    const thumb = document.querySelector<HTMLElement>('#cardBackGrid .cb-opt[data-k="witches"] .cb-thumb')!;
    expect(thumb.getAttribute('style')).toBe('background:' + cardBackCss('witches'));
    expect(cardBackCss('witches')).toContain('cardback-witches.webp');
  });

  it('card-back names and labels follow the language; switching to English loads card_en.json', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ 1: { kw: 'k', up: 'u', rev: 'r' } })));
    render(<SiteSettings />);
    openSite();
    expect(document.querySelector('#cardBackGrid .cb-opt[data-k="zodiac"] .cb-name')!.textContent).toBe('Vòng hoàng đạo');
    await userEvent.selectOptions($('langSel'), 'en');
    expect(localStorage.getItem('tarotLang')).toBe('en');
    expect(document.querySelector('#cardBackGrid .cb-opt[data-k="zodiac"] .cb-name')!.textContent).toBe('Zodiac wheel');
    expect($('siteOverlay').querySelector('h2')!.textContent).toContain('Site Settings');
    await vi.waitFor(() => expect(useApp.getState().cardEn).not.toBeNull());
    expect(fetchSpy).toHaveBeenCalledWith('/card_en.json');
    fetchSpy.mockRestore();
  });

  it('turning cloud save back on clears the backfill marker', async () => {
    localStorage.setItem('tarotCloudSave', '0');
    localStorage.setItem('tarotCloudBackfill', 'done');
    useApp.setState(initialState());
    render(<SiteSettings />);
    openSite();
    await userEvent.click($('siteCloud'));
    expect(localStorage.getItem('tarotCloudSave')).toBe('1');
    expect(localStorage.getItem('tarotCloudBackfill')).toBeNull();
  });
});
