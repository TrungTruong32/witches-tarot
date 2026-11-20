// Màn hình Yes/No (port từ witches_tarot.html L1106–1123, drawYesno L2178–2248, chips L4111).
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { cardText } from '../../core/cards';
import { renderMarkdown } from '../../core/markdown';
import type { Card, Lang } from '../../core/types';
import { firstSentence, localVerdict, parseVerdict, ynClass, yesNoMessages, type YnClass } from '../../core/yesno';
import { ensureAudio, sfx } from '../../engines/audio';
import { burstAt, haptic } from '../../engines/burst';
import { useT } from '../../i18n/useT';
import { providerChain, providerReady } from '../../services/ai/chat';
import { yesNoDeps } from './yesnoDeps';

const CHIPS = [
  { k: 'ynchip.opp', q: 'Tôi có nên nhận cơ hội / lời đề nghị này không?', qen: 'Should I take this opportunity / offer?' },
  { k: 'ynchip.rel', q: 'Mối quan hệ này có tương lai không?', qen: 'Does this relationship have a future?' },
  { k: 'ynchip.time', q: 'Bây giờ có phải thời điểm tốt để bắt đầu không?', qen: 'Is now a good time to begin?' },
  { k: 'ynchip.gut', q: 'Tôi có nên tin vào linh cảm của mình lúc này không?', qen: 'Should I trust my intuition right now?' },
  { k: 'ynchip.them', q: 'Người ấy có đang nghĩ về tôi không?', qen: 'Are they thinking about me?' },
] as const;


type Why = { kind: 'loading' } | { kind: 'text'; text: string } | { kind: 'html'; html: string };
interface Result {
  /** Số thứ tự lượt rút: mỗi lượt bung hạt đúng một lần. */
  n: number;
  card: Card;
  rev: boolean;
  lang: Lang;
  verdict: string;
  cls: YnClass;
  why: Why;
}

export function YesNo() {
  const { t, lang } = useT();
  const db = useApp(s => s.db);
  const deck = useApp(s => s.deck);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const qRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const drawId = useRef(0);

  // rời màn hình: huỷ lượt hỏi AI đang chạy
  useEffect(() => () => { abortRef.current?.abort(); drawId.current++; }, []);
  // bung hạt sau khi ảnh lá bài đã vẽ (mỗi lần rút một lá mới)
  useEffect(() => {
    if (res) burstAt(imgRef.current, 16);
  }, [res?.n]);

  async function draw() {
    if (!db) return;
    const rows = db.query({ deck });
    if (!rows.length) return;
    const c = rows[Math.floor(yesNoDeps.rng() * rows.length)] as Card;
    const rev = yesNoDeps.rng() < 0.5;
    const app = useApp.getState();
    const en = lang === 'en';
    const ct = cardText(c, lang, app.cardEn);
    const meaning = rev ? (ct.nghia_nguoc || ct.tu_khoa || '') : (ct.y_nghia_xuoi || ct.tu_khoa || '');
    const local = localVerdict(c, rev, lang);
    haptic(12); ensureAudio(); sfx.tick();

    abortRef.current?.abort();
    const my = ++drawId.current; // cũng là số thứ tự lượt rút
    const settings = app.aiSettings;
    const useAI = providerChain(settings).some(p => providerReady(p, settings));
    if (!useAI) {
      setRes({ n: my, card: c, rev, lang, verdict: local.verdict, cls: local.cls, why: { kind: 'text', text: firstSentence(meaning) } });
      return;
    }
    setRes({ n: my, card: c, rev, lang, verdict: '…', cls: 'maybe', why: { kind: 'loading' } });
    const ac = new AbortController();
    abortRef.current = ac;
    let raw = '';
    try {
      await yesNoDeps.chat(yesNoMessages(q.trim(), c, rev, lang, app.cardEn), { onToken: tk => { raw += tk; } },
        { settings, lang, deck: c.deck || app.deck || '', signal: ac.signal });
    } catch (e) {
      if (my !== drawId.current || ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      setRes({
        n: my, card: c, rev, lang, verdict: local.verdict, cls: local.cls,
        why: { kind: 'text', text: (en ? '⚠️ AI error (' : '⚠️ AI lỗi (') + msg + (en ? '). Using orientation-based verdict: ' : '). Tạm dùng phán quyết theo chiều lá: ') + firstSentence(meaning) },
      });
      return;
    }
    if (my !== drawId.current) return;
    const p = parseVerdict(raw);
    const verdict = p.verdict || local.verdict;
    setRes({
      n: my, card: c, rev, lang, verdict, cls: ynClass(verdict),
      why: p.body ? { kind: 'html', html: renderMarkdown(p.body) } : { kind: 'text', text: firstSentence(meaning) },
    });
  }

  const r = res;
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{t('yesno.head')}</h3>
      <div className="ai-hint" style={{ marginBottom: '12px' }}>{t('yesno.hint')}</div>
      <div className="yesno-ask">
        <input id="yesnoQ" type="text" ref={qRef} placeholder={t('yesno.ph')} value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void draw(); }} />
        <button className="btn-primary" id="yesnoBtn" onClick={() => void draw()}>{t('yesno.btn')}</button>
      </div>
      <div className="q-chips" id="ynChips">
        {CHIPS.map(c => (
          <button key={c.k} type="button" className="qchip" data-q={c.q} data-qen={c.qen}
            onClick={() => { setQ(lang === 'en' ? c.qen : c.q); qRef.current?.focus(); }}>{t(c.k)}</button>
        ))}
      </div>
      <div id="yesnoResult" className={'yesno-result' + (r ? ' show' : '')}>
        {r && (
          <>
            <div className={'yn-verdict ' + r.cls} id="ynVerdict">{r.verdict}</div>
            {r.card.image_url && (
              <img ref={imgRef} src={r.card.image_url} className={r.rev ? 'rev' : ''} alt={r.card.ten}
                onClick={() => useApp.getState().openLightbox(r.card.image_url as string, r.rev)} />
            )}
            <div className="yn-card-name">
              {r.card.ten}{r.rev ? (r.lang === 'en' ? ' (reversed)' : ' (ngược)') : (r.lang === 'en' ? ' (upright)' : ' (xuôi)')}
            </div>
            <div className="yn-why" id="ynWhy">
              {r.why.kind === 'loading' && <><span className="spinner"></span> {r.lang === 'en' ? 'Asking AI…' : 'Đang hỏi AI…'}</>}
              {r.why.kind === 'text' && r.why.text}
              {r.why.kind === 'html' && <span dangerouslySetInnerHTML={{ __html: r.why.html }} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
