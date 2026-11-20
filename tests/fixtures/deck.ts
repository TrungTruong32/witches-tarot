// Bộ bài GIẢ cỡ vừa (hai bộ) cho test tìm kiếm / lá hôm nay. Tên lá theo chuẩn tiếng Anh, nghĩa là chữ bịa.
import type { Card } from '../../src/core/types';

let nextId = 1;
const mk = (deck: string, bo: string, so: string, ten: string, extra: Partial<Card> = {}): Card => ({
  id: nextId++, deck, bo, so, ten,
  y_nghia_xuoi: `xuôi ${ten}`, nghia_nguoc: `ngược ${ten}`, tu_khoa: `từ khoá ${ten.toLowerCase()}`,
  mo_ta_hinh_anh: `hình ${ten}`, image_url: `https://www.tarot.vn/img/${nextId}.jpg`, ...extra,
});

const W = 'Witches Tarot';
const R = 'Rider-Waite';

export const deckCards: Card[] = [
  mk(W, 'Bo An Chinh', '0', 'The Fool'),
  mk(W, 'Bo An Chinh', 'I', 'The Magician'),
  mk(W, 'Bo An Chinh', 'V', 'The High Priest'),
  mk(W, 'Bo An Chinh', 'XV', 'The Shadow Side'),
  mk(W, 'Bo An Chinh', 'XVI', 'The Tower', { tu_khoa: 'biến động, sụp đổ' }),
  mk(W, 'Bo An Chinh', 'XX', 'Karma'),
  mk(W, 'Bo Cups', 'Ace', 'Ace of Cups'),
  mk(W, 'Bo Cups', '2', 'Two of Cups'),
  mk(W, 'Bo Cups', '10', 'Ten of Cups'),
  mk(W, 'Bo Swords', 'King', 'King of Swords'),
  mk(W, 'Bo Swords', 'Queen', 'Queen of Swords'),
  mk(W, 'Bo Swords', 'Page', 'Page of Swords'),
  mk(W, 'Bo Wands', '3', 'Three of Wands'),
  mk(W, 'Bo Pentacles', '1', 'Ace of Pentacles'),
  mk(R, 'Bo An Chinh', '0', 'The Fool'),
  mk(R, 'Bo An Chinh', 'XV', 'The Devil'),
  mk(R, 'Bo An Chinh', 'XX', 'Judgement'),
  mk(R, 'Bo Cups', 'Ace', 'Ace of Cups'),
  mk(R, 'Bo Swords', 'King', 'King of Swords'),
  mk(R, 'Bo Wands', '10', 'Ten of Wands'),
];
