// "Lá bài hôm nay": một lá cố định theo ngày + bộ bài (luôn xuôi) và ô nhật ký tự lưu. Theo bản cũ L1094–1103, L2476–2493.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { CorrChips } from '../../components/CorrChips';
import { cardText } from '../../core/cards';
import { dailyKey, pickDailyCard } from '../../core/daily';
import { CARD_IMG_H, CARD_IMG_W, FETCH_HIGH } from '../../components/cardImage';
import { useT } from '../../i18n/useT';
import { dailyNoteKey, getStr, setStr } from '../../services/storage';

/** Khoá ngày hiện tại (Y-M-D), tự chuyển sang ngày mới lúc nửa đêm khi trang vẫn mở.
 *  Hẹn giờ có thể chạy sớm (đồng hồ bị chỉnh lùi) hoặc trễ (máy ngủ) → luôn hẹn lại, và kiểm tra lại khi quay về tab. */
function useDayKey(): string {
  const [day, setDay] = useState(dailyKey);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const id = setTimeout(() => {
      setDay(dailyKey());
      setRound(r => r + 1); // vẫn cùng ngày thì setDay không đổi gì → round đổi để hẹn giờ lại
    }, next.getTime() - now.getTime() + 50);
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') setDay(dailyKey());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [day, round]);
  return day;
}

/** Ô nhật ký của một ngày; đổi ngày thì dựng lại (key) để đọc ghi chú của ngày mới. */
function DailyNote({ day }: { day: string }) {
  const { t } = useT();
  const [note, setNote] = useState(() => getStr(dailyNoteKey(day), ''));
  return (
    <div className="field" style={{ marginTop: '14px' }}>
      <label htmlFor="dailyNote">{t('daily.note')}</label>
      <textarea id="dailyNote" placeholder={t('daily.note.ph')} value={note}
        onChange={e => { setNote(e.target.value); setStr(dailyNoteKey(day), e.target.value); }} />
    </div>
  );
}

export function Daily() {
  const { t, lang } = useT();
  const db = useApp(s => s.db);
  const deck = useApp(s => s.deck);
  const cardEn = useApp(s => s.cardEn);
  const day = useDayKey();
  const card = useMemo(() => (db && deck ? pickDailyCard(db.query({ deck }), deck, day) : null), [db, deck, day]);
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
                {/* Ảnh là phần tử LCP của trang: tải ngay, ưu tiên cao; width/height giữ chỗ đúng tỉ lệ → không xô trang */}
                <img className="card-image" src={card.image_url} alt={card.ten} style={{ maxWidth: '220px' }}
                  width={CARD_IMG_W} height={CARD_IMG_H} decoding="async" {...FETCH_HIGH} />
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
      <DailyNote key={day} day={day} />
    </div>
  );
}
