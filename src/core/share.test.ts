import { describe, expect, it } from 'vitest';
import { loadLegacyWithContext } from '../../tests/legacy/harness';
import { fx, withOrientation as o } from '../../tests/fixtures/cards';
import { buildShareData, decodeShare, encodeShare, type ShareData } from './share';
import type { SpreadCard } from './types';

type Legacy = { encodeShare(o: unknown): Promise<string>; decodeShare(s: string): Promise<unknown>; buildShareData(): ShareData };
const spreadKeyBox = { value: 'ppf' };
const { fns: L, ctx } = loadLegacyWithContext<Legacy>(
  ['b64e', 'b64d', 'b64eBin', 'b64dBin', 'encodeShare', 'decodeShare', 'readingDecks', 'SPREADS', 'SPREAD_DEFS', 'currentSpreadKey', 'buildShareData'],
  { $: (id: string) => (id === 'spreadType' ? spreadKeyBox : null), spread: [], spreadPositions: null, selectedDeck: null, lastAnswerText: '', questionInput: { value: '' } },
);

const sample: ShareData = {
  q: 'Tình yêu của tôi sẽ ra sao? ✨',
  d: 'Witches Tarot',
  p: 'ppf',
  a: '✨ Tóm tắt: ' + 'Một câu trả lời khá dài với dấu tiếng Việt — “ngoặc kép” và emoji 🔮. '.repeat(20),
  c: [[1, 0], [23, 1], [39, 0]],
};
const tiny: ShareData = { q: '', d: '', p: 'free', a: '', c: [[1, 0]] };

describe('share links', () => {
  it('decodes a compressed link made by the legacy encoder (Vietnamese + emoji)', async () => {
    const legacy = await L.encodeShare(sample);
    expect(legacy[0]).toBe('1');
    expect(await decodeShare(legacy)).toEqual(sample);
  });
  it('decodes a plain ("0") link made by the legacy encoder', async () => {
    const legacy = await L.encodeShare(tiny);
    expect(legacy[0]).toBe('0');
    expect(await decodeShare(legacy)).toEqual(tiny);
    expect(await decodeShare('0' + Buffer.from(JSON.stringify(sample)).toString('base64url'))).toEqual(sample);
  });
  it('links made by the new encoder decode with the legacy decoder', async () => {
    for (const s of [sample, tiny]) expect(JSON.parse(JSON.stringify(await L.decodeShare(await encodeShare(s))))).toEqual(s);
  });
  it('returns null for garbage', async () => {
    for (const bad of ['garbage', '1!!!', '', '0%%%', '1AAAA']) expect(await decodeShare(bad), bad).toBeNull();
  });
  it('buildShareData matches legacy, including a card without id', async () => {
    const odd: SpreadCard = { ...o(fx.threeCups, 'nguoc'), id: -1, ten: 'Lá lạ', image_url: 'x.png', deck: 'Witches Tarot' };
    const cards = [o(fx.fool, 'xuoi'), odd, o(fx.rwFool, 'nguoc')];
    Object.assign(ctx, { spread: cards, selectedDeck: 'Witches Tarot', lastAnswerText: 'đáp án', questionInput: { value: '  Hỏi gì?  ' } });
    spreadKeyBox.value = 'ppf';
    const mine = buildShareData({ question: '  Hỏi gì?  ', fallbackDeck: 'Witches Tarot', spreadKey: 'ppf', answer: 'đáp án', cards });
    expect(mine).toEqual(JSON.parse(JSON.stringify(L.buildShareData())));
  });
});
