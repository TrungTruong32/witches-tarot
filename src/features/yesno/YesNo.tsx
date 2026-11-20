// Màn hình Yes/No (port từ witches_tarot.html L1106–1123, drawYesno L2178–2248, chips L4111).
// Logic một lượt ở yesnoDraw.ts; `deps` (rng, gọi AI) tiêm qua prop cho test, mặc định là thật.
import { useEffect, useRef, useState } from 'react';
import { aiCtx } from '../../app/aiCtx';
import { useApp } from '../../app/store';
import { IconLabel } from '../../components/Icon';
import { QuestionChips, type QuestionChip } from '../../components/QuestionChips';
import type { Card, Lang } from '../../core/types';
import { ensureAudio, sfx } from '../../engines/audio';
import { burstAt, haptic } from '../../engines/burst';
import { pickLang, useT } from '../../i18n/useT';
import { providerChain, providerReady } from '../../services/ai/chat';
import { aiAnswer, drawYesNoCard, localAnswer, type YesNoAnswer, type YesNoDeps } from './yesnoDraw';

const CHIPS: readonly QuestionChip[] = [
  { k: 'ynchip.opp', ico: 'wand', q: 'Tôi có nên nhận cơ hội / lời đề nghị này không?', qen: 'Should I take this opportunity / offer?' },
  { k: 'ynchip.rel', ico: 'rings', q: 'Mối quan hệ này có tương lai không?', qen: 'Does this relationship have a future?' },
  { k: 'ynchip.time', ico: 'hourglass', q: 'Bây giờ có phải thời điểm tốt để bắt đầu không?', qen: 'Is now a good time to begin?' },
  { k: 'ynchip.gut', ico: 'moon', q: 'Tôi có nên tin vào linh cảm của mình lúc này không?', qen: 'Should I trust my intuition right now?' },
  { k: 'ynchip.them', ico: 'eye', q: 'Người ấy có đang nghĩ về tôi không?', qen: 'Are they thinking about me?' },
];

interface Result extends YesNoAnswer {
  /** Số thứ tự lượt rút: mỗi lượt bung hạt đúng một lần. */
  n: number;
  card: Card;
  rev: boolean;
  /** Ngôn ngữ lúc rút (tên chiều lá, "Đang hỏi AI…"). */
  lang: Lang;
}

export function YesNo({ deps = {} }: { deps?: YesNoDeps }) {
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
  const drawNo = res?.n;
  useEffect(() => {
    if (drawNo != null) burstAt(imgRef.current, 16);
  }, [drawNo]);

  async function draw() {
    if (!db) return;
    const drawn = drawYesNoCard(db.query({ deck }), deps.rng);
    if (!drawn) return;
    const { card, rev } = drawn;
    const app = useApp.getState();
    haptic(12); ensureAudio(); sfx.tick();

    abortRef.current?.abort();
    const my = ++drawId.current; // cũng là số thứ tự lượt rút
    const base = { n: my, card, rev, lang };
    const settings = app.aiSettings;
    if (!providerChain(settings).some(p => providerReady(p, settings))) {
      setRes({ ...base, ...localAnswer(card, rev, lang, app.cardEn) });
      return;
    }
    setRes({ ...base, verdict: '…', cls: 'maybe', why: { kind: 'loading' } });
    const ac = new AbortController();
    abortRef.current = ac;
    const answer = await aiAnswer(q.trim(), card, rev, app.cardEn, aiCtx(card.deck || '', ac.signal), deps);
    if (answer && my === drawId.current) setRes({ ...base, ...answer });
  }

  const r = res;
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{t('yesno.head')}</h3>
      <div className="ai-hint" style={{ marginBottom: '12px' }}>{t('yesno.hint')}</div>
      <div className="yesno-ask">
        <input id="yesnoQ" type="text" ref={qRef} placeholder={t('yesno.ph')} value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void draw(); }} />
        <button className="btn-primary" id="yesnoBtn" data-ico="card" onClick={() => void draw()}><IconLabel icon="card" text={t('yesno.btn')} /></button>
      </div>
      <QuestionChips id="ynChips" chips={CHIPS} onPick={question => { setQ(question); qRef.current?.focus(); }} />
      <div id="yesnoResult" className={'yesno-result' + (r ? ' show' : '')}>
        {r && (
          <>
            <div className={'yn-verdict ' + r.cls} id="ynVerdict">{r.verdict}</div>
            {r.card.image_url && (
              <img ref={imgRef} src={r.card.image_url} className={r.rev ? 'rev' : ''} alt={r.card.ten}
                onClick={() => useApp.getState().openLightbox(r.card.image_url as string, r.rev)} />
            )}
            <div className="yn-card-name">
              {r.card.ten}{r.rev ? pickLang(r.lang, { vi: ' (ngược)', en: ' (reversed)' }) : pickLang(r.lang, { vi: ' (xuôi)', en: ' (upright)' })}
            </div>
            <div className="yn-why" id="ynWhy">
              {r.why.kind === 'loading' && <><span className="spinner"></span> {pickLang(r.lang, { vi: 'Đang hỏi AI…', en: 'Asking AI…' })}</>}
              {r.why.kind === 'text' && r.why.text}
              {r.why.kind === 'html' && <span dangerouslySetInnerHTML={{ __html: r.why.html }} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
