// Ô chọn chất bài dạng chồng bài 3D (renderCategoryTabs của bản cũ). Mỗi ô tải ngay 1 ảnh (lá giữa);
// 2 lá xoè hai bên chỉ tải khi rê chuột / focus / chọn ô đó → trang nhẹ.
import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../../app/store';
import { BO_LABELS, SUIT_META } from '../../core/suits';
import { useT } from '../../i18n/useT';

interface Tile {
  cat: string;
  count: number;
  cards: { ten: string; image_url: string | null }[];
}

/** Độ lệch ngẫu nhiên nhỏ của từng lớp (cố định trong một lần dựng ô). */
const jit = () => (Math.random() * 3 - 1.5).toFixed(2) + 'deg';

function SuitTile({ tile, active, onSelect }: { tile: Tile; active: boolean; onSelect: () => void }) {
  const { lang } = useT();
  const [loaded, setLoaded] = useState(false);
  const jitter = useMemo(() => Array.from({ length: 8 }, jit), []);
  const show = loaded || active;
  const en = lang === 'en';
  const m = SUIT_META[tile.cat] ?? { vi: BO_LABELS[tile.cat] ?? tile.cat, en: BO_LABELS[tile.cat] ?? tile.cat, sym: '✧' };
  const meta = (m.el ? (en ? m.el[1] : m.el[0]) + ' · ' : '') + tile.count + (en ? ' cards' : ' lá');
  // lá giữa (k=0) nằm trên cùng và tải ngay; hai lá bên tải khi cần. Không có ảnh → mặt lưng bài.
  const order: [number, Tile['cards'][number] | undefined][] = [[-1, tile.cards[1]], [1, tile.cards[2]], [0, tile.cards[0]]];
  return (
    <button type="button" className={'suit-tile' + (active ? ' active' : '')} aria-pressed={active ? 'true' : 'false'}
      onMouseEnter={() => setLoaded(true)} onFocus={() => setLoaded(true)} onClick={() => { setLoaded(true); onSelect(); }}>
      <span className="st-scene" aria-hidden="true">
        <span className="st-bob">
          {[0, 1, 2, 3, 4].map(i => (
            <i key={i} className="st-layer" style={{ '--z': i, '--j': jitter[i] } as CSSProperties}></i>
          ))}
          {order.map(([k, c], i) => {
            const style = { '--z': 5 + i, '--j': jitter[5 + i] } as CSSProperties;
            if (!c?.image_url) return <span key={k} className="st-card" data-k={k} style={style}></span>;
            return <img key={k} className="st-card" data-k={k} style={style} src={k === 0 || show ? c.image_url : undefined} alt="" decoding="async" />;
          })}
        </span>
        <span className="st-shadow"></span>
      </span>
      <span className="st-name">{en ? m.en : m.vi}</span>
      <span className="st-meta">
        <span className="sym">{m.sym}</span> {meta}
      </span>
    </button>
  );
}

export function SuitTiles({ category, onSelect }: { category: string; onSelect: (cat: string) => void }) {
  const db = useApp(s => s.db);
  const deck = useApp(s => s.deck);
  const tiles = useMemo<Tile[]>(() => {
    if (!db || !deck) return [];
    const out: Tile[] = [{ cat: 'all', count: db.count(deck), cards: [] }]; // "Tất cả": xấp mặt lưng, không tốn ảnh
    for (const r of db.suits(deck)) if (r.bo) out.push({ cat: r.bo, count: r.c, cards: db.topCards(deck, r.bo) });
    return out;
  }, [db, deck]);
  return (
    <div className="category-tabs suits" id="categoryTabs">
      {tiles.map(tile => (
        <SuitTile key={deck + '|' + tile.cat} tile={tile} active={category === tile.cat} onSelect={() => onSelect(tile.cat)} />
      ))}
    </div>
  );
}
