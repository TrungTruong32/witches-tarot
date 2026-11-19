// Lá bài GIẢ cho test — dữ liệu thật không được đưa vào repo công khai.
import type { Card, Orientation, SpreadCard } from '../../src/core/types';

const W = 'Witches Tarot';
const card = (id: number, bo: string, so: string, ten: string, extra: Partial<Card> = {}): Card => ({
  id, deck: W, bo, so, ten,
  y_nghia_xuoi: `xuôi ${ten}`, nghia_nguoc: `ngược ${ten}`, tu_khoa: `từ khoá ${ten}`, image_url: `img/${id}.jpg`,
  ...extra,
});

export const fx = {
  fool: card(1, 'Bo An Chinh', '0', 'The Fool', { chiem_tinh_hoc: 'Cung Bạch Dương.' }),
  tower: card(17, 'Bo An Chinh', 'XVI', 'The Tower', { chiem_tinh_hoc: 'Hỏa Tinh' }),
  aceWands: card(23, 'Bo Wands', 'Ace', 'Ace of Wands'),
  threeWands: card(25, 'Bo Wands', '3', 'Three of Wands'),
  threeCups: card(39, 'Bo Cups', '3', 'Three of Cups'),
  kingSwords: card(64, 'Bo Swords', 'King', 'King of Swords'),
  queenPentacles: card(77, 'Bo Pentacles', 'Queen', 'Queen of Pentacles'),
  fiveSwords: card(55, 'Bo Swords', '5', 'Five of Swords'),
  rwFool: card(101, 'Bo An Chinh', '0', 'The Fool (RW)', { deck: 'Rider-Waite' }),
};

export const withOrientation = (c: Card, orientation: Orientation): SpreadCard => ({ ...c, orientation });
