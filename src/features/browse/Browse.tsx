// Trang Tra cứu: ô tìm kiếm thông minh, ô chọn chất bài, danh sách lá và chi tiết. Markup theo bản cũ L944–961.
import { useEffect, useMemo, useRef } from 'react';
import { useApp, useDeckOrGuess } from '../../app/store';
import { DeckSelect } from '../../components/DeckSelect';
import { media, prefersReducedMotion } from '../../lib/media';
import { createCardSearch } from '../../core/search';
import { SEO_DECK_SLUG } from '../../core/suits';
import type { Card } from '../../core/types';
import { useT } from '../../i18n/useT';
import { CardDetails } from './CardDetails';
import { SuitTiles } from './SuitTiles';

export function Browse() {
  const { t } = useT();
  const db = useApp(s => s.db);
  // DB đang nạp: bộ boot() sẽ chọn → bấm ô chất bài trước khi DB về vẫn được giữ (browse.deck khớp bộ thật)
  const deck = useDeckOrGuess();
  // Bộ lọc/ô tìm/lá đang chọn nằm trong store → rời Tra cứu rồi quay lại vẫn đúng chỗ cũ
  const browse = useApp(s => s.browse);
  const setBrowse = useApp(s => s.setBrowse);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // setDeck trong store đã reset browse khi đổi bộ bài. Còn lại: bộ bài do boot khôi phục (chưa qua setDeck)
  // → browse.deck khác deck → dùng mặc định, và lần sửa đầu tiên ghi kèm bộ bài hiện tại.
  const fresh = { category: 'all', query: '', picked: null };
  const stale = browse.deck !== deck;
  const { category, query, picked } = stale ? fresh : browse;
  const update = (p: Partial<typeof browse>) => setBrowse({ ...(stale ? fresh : {}), deck, ...p });
  const setQuery = (q: string) => update({ query: q });
  const setCategory = (c: string) => update({ category: c, query: '' });

  const search = useMemo(() => (db && deck ? createCardSearch(db.query({ deck, category: 'all' })) : null), [db, deck]);
  const rows = useMemo<Card[]>(() => {
    if (!db) return [];
    const q = query.trim();
    let list = db.query({ deck, category, text: q });
    if (q && search) {
      // Khớp tên/biệt danh trước ("át kiếm", "hoàng hậu tiền", "13"…), rồi mới tới khớp chữ trong nội dung
      const smart = search(q, 78).filter(c => category === 'all' || c.bo === category);
      const seen = new Set(smart.map(c => c.id));
      list = smart.concat(list.filter(c => !seen.has(c.id)));
    }
    return list;
  }, [db, deck, category, query, search]);

  // Mỗi lần danh sách đổi, lá đầu tiên được chọn; bấm lá khác thì chọn lá đó
  const listKey = `${deck}|${category}|${query.trim()}`;
  const selected = (picked?.key === listKey ? rows.find(c => c.id === picked.id) : undefined) ?? rows[0] ?? null;

  const scrollOnPick = useRef(false);
  useEffect(() => {
    // Điện thoại / máy tính bảng (chi tiết nằm dưới danh sách): bấm lá → cuộn tới chi tiết; giảm chuyển động thì nhảy thẳng
    if (scrollOnPick.current && media('(max-width: 980px)').matches) {
      detailsRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    scrollOnPick.current = false;
  }, [picked]);

  const slug = deck ? SEO_DECK_SLUG[deck] : undefined;
  return (
    <>
      <div className="controls">
        <DeckSelect id="deckSelectBrowse" className="deck-inline" aria-label="Bộ bài" title="Chọn bộ bài để tra nghĩa" />
        <input id="searchInput" ref={searchRef} className="search" type="search" placeholder={t('browse.search')} value={query}
          onChange={e => setQuery(e.target.value)} />
        <button id="clearButton" type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>{t('browse.clear')}</button>
      </div>
      <SuitTiles category={category} onSelect={setCategory} />
      <p className="pages-link">
        <a id="browsePagesLink" href={slug ? `/la-bai/${slug}/` : '/la-bai/'} target="_blank" rel="noopener">{t('browse.pages')}</a>
      </p>
      <div className="layout">
        <div className="panel">
          <div id="cardsList" className="cards-list">
            {rows.map(card => (
              <button key={card.id} type="button" className={'card-item' + (selected?.id === card.id ? ' active' : '')}
                onClick={() => { scrollOnPick.current = true; update({ picked: { key: listKey, id: card.id } }); }}>
                <strong>{card.so} - {card.ten}</strong>
                <span>{card.bo || ''}</span>
              </button>
            ))}
          </div>
          <div id="noResults" className="no-results" style={{ display: rows.length || !db ? 'none' : 'block' }}>{t('browse.noResults')}</div>
        </div>
        <div className="panel">
          <CardDetails ref={detailsRef} card={selected} />
        </div>
      </div>
    </>
  );
}
