// Chi tiết một lá ở trang Tra cứu (selectCard của bản cũ). Phần chỉ có tiếng Việt thì ẩn khi giao diện EN.
import { forwardRef } from 'react';
import { useApp } from '../../app/store';
import { CorrChips } from '../../components/CorrChips';
import { cardText } from '../../core/cards';
import { seoCardPath } from '../../core/suits';
import type { Card } from '../../core/types';
import { useT } from '../../i18n/useT';

function Section({ title, text }: { title: string; text: string | undefined | null }) {
  if (!text) return null;
  return (
    <div className="section">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export const CardDetails = forwardRef<HTMLDivElement, { card: Card | null }>(function CardDetails({ card }, ref) {
  const { t, lang } = useT();
  const cardEn = useApp(s => s.cardEn);
  if (!card) {
    return (
      <div id="cardDetails" className="details" ref={ref}>
        <div className="section">
          <h3>Chưa chọn lá bài</h3>
          <p>Hãy thử tìm kiếm khác hoặc xóa bộ lọc.</p>
        </div>
      </div>
    );
  }
  const ct = cardText(card, lang, cardEn);
  const seo = seoCardPath(card);
  const vi = lang === 'vi';
  return (
    <div id="cardDetails" className="details" ref={ref}>
      {card.image_url && (
        <div className="section card-image-wrapper">
          <img className="card-image" src={card.image_url} alt={card.ten} loading="lazy" />
        </div>
      )}
      <div className="section">
        <div className="meta">
          <span className="badge">{card.so}</span>
          <span>{card.bo || ''}</span>
        </div>
        <h2>{card.ten}</h2>
        <div className="meta">
          {seo && (
            <span>
              <a href={seo} target="_blank" rel="noopener">{t('lbl.cardPage')} ↗</a>
            </span>
          )}
          {card.url && (
            <span>
              <strong>{t('lbl.source')}:</strong> <a href={card.url} target="_blank" rel="noreferrer noopener">tarot.vn</a>
            </span>
          )}
        </div>
        <CorrChips card={card} />
      </div>
      {vi && <Section title="Chiêm tinh học" text={card.chiem_tinh_hoc} />}
      {vi && <Section title="Thần thánh" text={card.than_thanh} />}
      {vi && <Section title="Mô tả hình ảnh" text={card.mo_ta_hinh_anh} />}
      <Section title={t('lbl.keywords')} text={ct.tu_khoa} />
      <Section title={t('lbl.upright')} text={ct.y_nghia_xuoi} />
      <Section title={t('lbl.reversed')} text={ct.nghia_nguoc} />
      {vi && <Section title="Nội dung đầy đủ" text={card.content} />}
    </div>
  );
});
