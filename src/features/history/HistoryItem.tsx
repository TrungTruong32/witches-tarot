// Một lượt trong "Lịch sử" (khối .hist-item của renderHistory, bản cũ L4400–4448).
import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '../../core/markdown';
import { orientLabel } from '../../core/journal';
import { spreadByKey } from '../../core/spreads';
import type { Reading } from '../../core/types';
import { useT } from '../../i18n/useT';
import { updateReading } from '../../services/idb';
import { saveNoteDebounced } from '../reading/interpret';

interface Props {
  item: Reading;
  onLoad(it: Reading): void;
  onDelete(it: Reading): void;
  onNote(it: Reading, value: string): void;
}

export function HistoryItem({ item: it, onLoad, onDelete, onNote }: Props) {
  const { lang, pick } = useT();
  const en = lang === 'en';
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(it.note || '');
  const [status, setStatus] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const time = new Date(it.ts).toLocaleString(en ? 'en-US' : 'vi-VN');
  const cards = it.cards || [];
  const summary = cards.map(c => c.ten + (c.orientation === 'nguoc' ? (en ? ' (reversed)' : ' (ngược)') : '')).join(', ');
  const sdef = it.spread ? spreadByKey(it.spread) : undefined;
  const spreadName = sdef && it.spread !== 'free' ? ' · ' + (en ? sdef.en : sdef.vi) : '';
  const provider = /^free/.test(it.provider || '') ? (en ? 'Free AI' : 'AI miễn phí') : (it.provider || '');
  const pos = it.positions || [];

  const onChange = (value: string) => {
    setNote(value);
    setStatus(en ? 'Saving…' : 'Đang lưu…');
    onNote(it, value);
    // Gói update để biết khi nào ghi xong (saveNoteDebounced gộp theo id, giữ bản mới nhất)
    saveNoteDebounced(it, value, async r => {
      try {
        await updateReading(r);
        if (alive.current) setStatus(en ? '✓ Saved' : '✓ Đã lưu');
      } catch (e) {
        if (alive.current) setStatus((en ? '⚠️ Save failed: ' : '⚠️ Lưu thất bại: ') + (e instanceof Error ? e.message : String(e)));
        throw e;
      }
    });
  };

  return (
    <div className="hist-item">
      <div className="row">
        <div className="info">
          <div className="time">{time + ' · ' + (it.deck || '') + spreadName + ' · ' + provider}</div>
          <div className="q"><strong>{it.question || (en ? '(no question)' : '(không có câu hỏi)')}</strong></div>
          <div className="time">{summary}</div>
          {it.note ? <div className="hist-note-preview">{'📝 ' + (it.note.length > 140 ? it.note.slice(0, 140) + '…' : it.note)}</div> : null}
        </div>
        <div className="hist-actions">
          <button onClick={() => setOpen(o => !o)}>{open ? (en ? 'Hide' : 'Ẩn') : (en ? 'View' : 'Xem')}</button>
          <button onClick={() => onLoad(it)}>{en ? 'Reload' : 'Tải lại'}</button>
          <button className="rm" title={en ? 'Delete' : 'Xóa'} onClick={() => onDelete(it)}>✕</button>
        </div>
      </div>
      <div className={'hist-detail' + (open ? ' open' : '')}>
        <div className="hist-cards">
          {cards.map((c, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {'• '}{pos[i] ? <><em>{pos[i]}</em>{': '}</> : null}{c.ten + ' — ' + orientLabel(c, lang)}
            </span>
          ))}
        </div>
        {it.facts && it.facts.length ? (
          <div className="facts-box facts-static">
            <div className="facts-body">{it.facts.map((l, i) => <div key={i}>{'• ' + l}</div>)}</div>
          </div>
        ) : null}
        <div className="ai-output" dangerouslySetInnerHTML={{ __html: renderMarkdown(it.text || '') }} />
        {(it.followups || []).map((f, i) => (
          <div key={i}>
            <div className="chat-q" style={{ marginTop: '10px' }}>{'☌︎ ' + f.q}</div>
            <div className="chat-a ai-output" dangerouslySetInnerHTML={{ __html: renderMarkdown(f.a || '') }} />
          </div>
        ))}
        <div className="field hist-note">
          <label>{pick({ vi: '📝 Ghi chú nhật ký (tự lưu)', en: '📝 Journal note (auto-saved)' })}</label>
          <textarea
            placeholder={pick({ vi: 'Cảm nhận của bạn, điều thực sự đã xảy ra…', en: 'Your reflections, what actually happened…' })}
            value={note}
            onChange={e => onChange(e.target.value)}
          />
          <div className="hint">{status}</div>
        </div>
      </div>
    </div>
  );
}
