// Tìm lá bài thông minh. Hiểu: Ace = Át = 1, số Ả Rập ↔ La Mã (13 = XIII), tên chất tiếng Việt (Kiếm, Chén/Cốc, Gậy,
// Tiền/Xu), lá hoàng gia (Vua, Hoàng hậu, Hiệp sĩ, Tiểu đồng), tên Ẩn Chính tiếng Việt và tên thường gặp ở bộ khác.
// Số luôn so khớp NGUYÊN TỪ: "1" chỉ ra Ace/I, không ra "10".
import type { Card } from './types';

/** Bỏ dấu, chữ thường, chỉ giữ a-z0-9 và khoảng trắng đơn. */
export const fold = (t: unknown): string =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ROMAN: Record<string, number | string> = {
  0: '0', i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14,
  xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21,
};
type Suit = 'wands' | 'cups' | 'swords' | 'pentacles';
type Court = 'page' | 'knight' | 'queen' | 'king';
const SUIT_ALIAS: Record<Suit, string[]> = {
  wands: ['wands', 'wand', 'gay', 'batons', 'baton', 'rods', 'rod', 'lua'],
  cups: ['cups', 'cup', 'chen', 'coc', 'ly', 'nuoc'],
  swords: ['swords', 'sword', 'kiem', 'guom', 'khi'],
  pentacles: ['pentacles', 'pentacle', 'coins', 'coin', 'tien', 'xu', 'dong xu', 'disks', 'disk', 'dat'],
};
const COURT_ALIAS: Record<Court, string[]> = {
  page: ['page', 'tieu dong', 'thi dong', 'hau dong', 'princess'],
  knight: ['knight', 'hiep si', 'ky si'],
  queen: ['queen', 'hoang hau', 'nu hoang'],
  king: ['king', 'vua', 'quoc vuong'],
};
const RANK_WORDS: Record<string, number> = {
  ace: 1, at: 1, mot: 1, one: 1, hai: 2, two: 2, ba: 3, three: 3, bon: 4, four: 4, nam: 5, five: 5, sau: 6, six: 6,
  bay: 7, seven: 7, tam: 8, eight: 8, chin: 9, nine: 9, muoi: 10, ten: 10,
};
/** Tên Ẩn Chính theo số: tên trong bộ Witches + tên chuẩn Rider-Waite + tên tiếng Việt hay dùng. */
const MAJOR_ALIAS: string[][] = [
  ['fool', 'chang kho', 'ke khu kho', 'ga khung'], ['magician', 'nha ao thuat', 'phu thuy'], ['high priestess', 'nu tu te', 'nu giao hoang', 'nu tu'],
  ['empress', 'hoang hau', 'nu hoang'], ['emperor', 'hoang de'], ['high priest', 'hierophant', 'giao hoang', 'thay te', 'tu te'],
  ['lovers', 'tinh nhan', 'nhung nguoi yeu nhau', 'cap doi'], ['chariot', 'co xe', 'chien xa', 'xe ngua'], ['strength', 'suc manh'],
  ['hermit', 'an si', 'an gia'], ['wheel', 'wheel of fortune', 'banh xe', 'banh xe so phan', 'van menh'], ['justice', 'cong ly'],
  ['hanged man', 'nguoi treo nguoc', 'treo nguoc', 'nguoi bi treo'], ['death', 'cai chet', 'tu than'], ['temperance', 'tiet do', 'dieu do', 'tiet che'],
  ['shadow side', 'devil', 'ac quy', 'mat toi', 'quy du'], ['tower', 'toa thap', 'thap'], ['star', 'ngoi sao', 'vi sao'], ['moon', 'mat trang'],
  ['sun', 'mat troi'], ['karma', 'judgement', 'judgment', 'phan xet', 'nghiep', 'su phan xet'], ['world', 'the gioi', 'vu tru'],
];
const STOP = new Set(['of', 'the', 'la', 'bai', 'cua', 'bo', 'so', 'quan', 'card', 'tarot']);

interface Entry {
  card: Card;
  names: string[];
  suit: Suit | null;
  major: boolean;
  rank: number | null;
  court: Court | null;
  kw: string;
  txt: string;
}
interface ParsedQuery {
  suit: Suit | null;
  court: Court | null;
  rank: number | null;
  ace: boolean;
  rest: string[];
}

const keysOf = <K extends string>(o: Record<K, unknown>) => Object.keys(o) as K[];

function indexCard(card: Card): Entry {
  const nm = fold(card.ten);
  const bo = fold(card.bo);
  const so = fold(card.so);
  const hay = ' ' + nm + ' ' + bo + ' ';
  const suit = keysOf(SUIT_ALIAS).find(k => SUIT_ALIAS[k].some(w => hay.includes(' ' + w + ' '))) ?? null;
  const major = !suit && (/an chinh|major/.test(bo) || so in ROMAN);
  let rank: number | null = null;
  let court: Court | null = null;
  if (major) {
    const r = ROMAN[so];
    rank = so === '0' ? 0 : typeof r === 'number' ? r : Number.isFinite(+so) ? +so : null;
  } else if (so === 'ace' || so === '1') rank = 1;
  else if (/^\d+$/.test(so)) rank = +so;
  else court = keysOf(COURT_ALIAS).find(k => so === k || COURT_ALIAS[k].includes(so)) ?? null;
  const names = [nm, nm.replace(/^the /, '')];
  const alias = rank != null ? MAJOR_ALIAS[rank] : undefined;
  if (major && alias) names.push(...alias);
  return {
    card, names, suit, major, rank, court,
    kw: fold(card.tu_khoa),
    txt: fold([card.y_nghia_xuoi, card.nghia_nguoc, card.mo_ta_hinh_anh].join(' ')),
  };
}

/** Tách truy vấn thành: chất / hạng số / lá hoàng gia / phần chữ còn lại. */
function parseQuery(q: string): ParsedQuery {
  let rest = ' ' + q + ' ';
  const out: ParsedQuery = { suit: null, court: null, rank: null, ace: false, rest: [] };
  const take = <K extends string>(dict: Record<K, string[]>): K | null => {
    for (const k of keysOf(dict))
      for (const w of [...dict[k]].sort((x, y) => y.length - x.length))
        if (rest.includes(' ' + w + ' ')) {
          rest = rest.replace(' ' + w + ' ', ' ');
          return k;
        }
    return null;
  };
  out.court = take(COURT_ALIAS);
  out.suit = take(SUIT_ALIAS);
  const toks = rest.trim().split(/\s+/).filter(Boolean).filter(t => !STOP.has(t));
  toks.forEach((t, i) => {
    if (out.rank == null && /^\d{1,2}$/.test(t) && +t <= 21) {
      out.rank = +t;
      return;
    }
    const word = RANK_WORDS[t];
    if (out.rank == null && word !== undefined) {
      out.rank = word;
      out.ace = t === 'ace' || t === 'at';
      return;
    }
    if (out.rank == null && t !== '0' && t in ROMAN) {
      out.rank = ROMAN[t] as number;
      return;
    }
    if (out.rank == null && t === 'a' && (out.suit || toks.length > 1)) {
      out.rank = 1;
      out.ace = true;
      return;
    }
    // gõ dở tên chất ở từ cuối (vd "kie", "pent")
    if (!out.suit && i === toks.length - 1 && t.length >= 3) {
      const s = keysOf(SUIT_ALIAS).find(k => SUIT_ALIAS[k].some(w => w.startsWith(t)));
      if (s) {
        out.suit = s;
        return;
      }
    }
    out.rest.push(t);
  });
  return out;
}

function score(e: Entry, q: string, p: ParsedQuery): number {
  let sc = 0;
  // 1) khớp tên (kể cả tên tiếng Việt / tên bộ khác); truy vấn kết thúc bằng chữ số thì số phải khớp NGUYÊN
  const qq = /\d$/.test(q) ? q + ' ' : q;
  for (const n of e.names) {
    if (n === q) sc = Math.max(sc, 1000);
    else if ((n + ' ').startsWith(qq)) sc = Math.max(sc, 760);
    else if (q.length >= 3 && (' ' + n + ' ').includes(' ' + qq)) sc = Math.max(sc, 600);
  }
  // 2) khớp cấu trúc: chất + hạng + hoàng gia
  if (p.suit || p.court || p.rank != null) {
    let ok = true;
    let pts = 0;
    if (p.suit) {
      if (e.suit === p.suit) pts += 200;
      else ok = false;
    }
    if (p.court) {
      if (e.court === p.court) pts += 250;
      else ok = false;
    }
    if (p.rank != null) {
      if (e.rank === p.rank && (e.major ? !p.suit && !p.court && !p.ace : true)) pts += 250;
      else ok = false;
    }
    if (ok) {
      const restOk = p.rest.every(t => e.names.some(n => (' ' + n + ' ').includes(' ' + t)));
      sc = Math.max(sc, (restOk ? 500 : 250) + pts + (e.major ? 0 : 5));
    }
  }
  // 3) dự phòng: từ khoá / nội dung (chỉ khi gõ ≥ 3 ký tự và chưa khớp gì)
  if (!sc && q.length >= 3) {
    const re = new RegExp('(^| )' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (re.test(e.kw)) sc = 80;
    else if (re.test(e.txt)) sc = 20;
  }
  return sc;
}

/** Tạo hàm tìm kiếm cho MỘT bộ bài (chỉ mục dựng một lần). Kết quả: điểm cao trước, cùng điểm thì theo id. */
export function createCardSearch(cards: Card[]): (raw: string, limit?: number) => Card[] {
  const index = [...cards].sort((a, b) => a.id - b.id).map(indexCard);
  return (raw, limit = 8) => {
    const q = fold(raw);
    if (!q) return [];
    const p = parseQuery(q);
    return index
      .map(e => ({ e, sc: score(e, q, p) }))
      .filter(x => x.sc > 0)
      .sort((x, y) => y.sc - x.sc || x.e.card.id - y.e.card.id)
      .slice(0, limit)
      .map(x => x.e.card);
  };
}
