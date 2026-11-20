// "Lá bài hôm nay": một lá cố định theo ngày + bộ bài (luôn xuôi) và ô nhật ký tự lưu. Theo bản cũ L1094–1103, L2476–2493.
import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { CorrChips } from '../../components/CorrChips';
import { cardText } from '../../core/cards';
import { dailyKey, pickDailyCard } from '../../core/daily';
import { useT } from '../../i18n/useT';
import { dailyNoteKey, getStr, setStr } from '../../services/storage';

export function Daily() {
  const { t, lang } = useT();
  const db = useApp(s => s.db);
  const deck = useApp(s => s.deck);
  const cardEn = useApp(s => s.cardEn);
  const day = dailyKey();
  const card = useMemo(() => (db && deck ? pickDailyCard(db.query({ deck }), deck) : null), [db, deck]);
  const [note, setNote] = useState(() => getStr(dailyNoteKey(day), ''));
  const ct = card ? cardText(card, lang, cardEn) : null;

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        <span>{t('daily.head')}</span> <span id="dailyDate" className="time">{card && deck ? '(' + day + ' · ' + deck + ')' : ''}</span>
      </h3>
      <div id="dailyCard">
        {card && ct && (
          <>
            {card.image_url && (
              <div className="card-image-wrapper">
                <img className="card-image" src={card.image_url} alt={card.ten} style={{ maxWidth: '220px' }} loading="lazy" />
              </div>
            )}
            <div className="draw-name" style={{ fontSize: '1.2rem' }}>
              {card.ten} <span className="orient-badge xuoi">{t('daily.xuoi')}</span>
            </div>
            {card.bo && <div className="time">{card.bo}</div>}
            <CorrChips card={card} />
            {ct.tu_khoa && (
              <div className="section" style={{ marginTop: '10px' }}>
                <h3>{t('lbl.keywords')}</h3>
                <p>{ct.tu_khoa}</p>
              </div>
            )}
            <div className="section" style={{ marginTop: '10px' }}>
              <h3>{t('daily.meaning')}</h3>
              <p>{ct.y_nghia_xuoi || ''}</p>
            </div>
          </>
        )}
      </div>
      <div className="field" style={{ marginTop: '14px' }}>
        <label htmlFor="dailyNote">{t('daily.note')}</label>
        <textarea id="dailyNote" placeholder={t('daily.note.ph')} value={note}
          onChange={e => { setNote(e.target.value); setStr(dailyNoteKey(dailyKey()), e.target.value); }} />
      </div>
    </div>
  );
}
