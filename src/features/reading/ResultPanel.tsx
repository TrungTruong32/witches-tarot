// Cột lời giải của "Trải bài AI" (#resultPanel, markup L1047–1072): lời giải AI đang stream, hỏi tiếp, đọc to (TTS),
// nút chia sẻ (Task 8 gắn xử lý), ghi chú nhật ký, nền lá bài trôi. Mọi trạng thái nằm ở useInterpret / useReading.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useApp } from '../../app/store';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';
import { aiBgKey, startAiCardsBg, type AiCardsBg } from './aiCardsBg';
import { AiStream } from './AiStream';
import { noteStatusText, quotaText, runFollowUp, saveNoteDebounced, useInterpret } from './interpret';
import { useReading } from './readingStore';
import { exportReadingImage, shareReadingLink } from './share';

// Ghi chú khi mở lời giải từ link chia sẻ (loadSharedFromHash L4100–4103): nội dung do người gửi tạo
const SHARED_NOTE_EN = '🔗 Shared via link — this text was created by the sender and may have been edited. Witches Tarot never asks for money or personal details.';
const SHARED_NOTE_VI = '🔗 Trải bài được chia sẻ qua link — nội dung do người gửi tạo và có thể đã bị chỉnh sửa. Witches Tarot không bao giờ yêu cầu chuyển tiền hay thông tin cá nhân.';

const show = (on: boolean, display = 'inline-block') => ({ display: on ? display : 'none' });

/** speakReading: đọc to lời giải bằng giọng vi-VN; đang đọc thì bấm lần nữa để dừng. */
function speak(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (synth.speaking) {
    synth.cancel();
    return;
  }
  const t = text.trim();
  if (!t) return;
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'vi-VN';
  u.rate = 1;
  u.pitch = 1;
  const v = (synth.getVoices() || []).find(x => /vi/i.test(x.lang));
  if (v) u.voice = v;
  synth.speak(u);
}

/** Nền lá bài trôi: dựng lại khi trải bài đổi (aiBgKey), chỉ đổi chế độ khi trải bài giữ nguyên; tắt khi rời màn. */
function useAiCardsBg(box: RefObject<HTMLDivElement>) {
  const cards = useReading(s => s.cards);
  const mode = useReading(s => s.aiBg);
  const on = mode !== 'off' && cards.length > 0;
  const key = aiBgKey(cards);
  const bg = useRef<AiCardsBg | null>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  useEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    const b = startAiCardsBg(el, cardsRef.current, prefersReducedMotion());
    bg.current = b;
    return () => {
      b.stop();
      bg.current = null;
    };
  }, [box, on, key]);

  useEffect(() => {
    if (mode !== 'off') bg.current?.mode(mode);
  }, [on, mode, key]);

  return on;
}

/** Ô ghi chú nhật ký (showReadingNote / saveNoteDebounced): chỉ hiện khi lượt này đã lưu vào nhật ký (có id). */
function ReadingNote() {
  const { t, lang } = useT();
  const current = useReading(s => s.current);
  const status = useInterpret(s => s.noteStatus);
  const id = current?.id;
  const [value, setValue] = useState(current?.note || '');
  // Bản ghi khác → nạp ghi chú của nó (như showReadingNote)
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    setValue(current?.note || '');
  }
  const visible = id != null;
  return (
    <div id="readingNoteWrap" className="field" style={{ ...show(visible, 'block'), marginTop: '14px' }}>
      <label htmlFor="readingNote">{t('reading.note')}</label>
      <textarea
        id="readingNote"
        placeholder={t('reading.note.ph')}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          const cur = useReading.getState().current;
          if (cur && cur.id != null) saveNoteDebounced(cur, e.target.value);
        }}
      ></textarea>
      <div className="hint" id="readingNoteStatus">{visible ? noteStatusText(status, lang) : ''}</div>
    </div>
  );
}

function ChatFollow() {
  const { lang } = useT();
  const open = useInterpret(s => s.chatOpen);
  const busy = useInterpret(s => s.chatBusy);
  const follows = useInterpret(s => s.follows);
  const [q, setQ] = useState('');
  const send = () => {
    if (!q.trim() || busy || !useReading.getState().messages.length) return;
    setQ('');
    void runFollowUp(q);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  return (
    <div id="chatFollow" style={show(open, 'block')}>
      <div id="chatLog">
        {follows.map((f, i) => (
          <Fragment key={i}>
            <div className="chat-q">{'☌︎ ' + f.q}</div>
            <AiStream view={f.view} lang={lang} className="chat-a ai-output" />
          </Fragment>
        ))}
      </div>
      <div className="chat-input-row">
        <textarea
          id="chatInput"
          maxLength={1500}
          placeholder="Hỏi tiếp về trải bài này… (Enter để gửi, Shift+Enter xuống dòng)"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
        ></textarea>
        <button id="chatSend" className="btn-primary" disabled={busy} onClick={send}>Gửi</button>
      </div>
    </div>
  );
}

/** Nút 🔗 Link: "✅ Đã copy link" trong 2 s sau khi chép (chữ nút là state, không sửa DOM). */
function ShareLinkButton({ visible }: { visible: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onClick = async () => {
    if ((await shareReadingLink()) !== 'copied') return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setCopied(false);
    }, 2000);
  };
  return (
    <button id="shareLinkBtn" title="Sao chép link chia sẻ trải bài" style={show(visible)} onClick={() => void onClick()}>
      {copied ? '✅ Đã copy link' : '🔗 Link'}
    </button>
  );
}

/** Nút 📸 Tải ảnh: khoá và hiện "⏳ Đang tạo…" trong lúc vẽ ảnh. */
function ShareImgButton({ visible }: { visible: boolean }) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const onClick = async () => {
    setBusy(true);
    try {
      await exportReadingImage();
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <button id="shareImgBtn" title="Tải ảnh trải bài để chia sẻ" style={show(visible)} disabled={busy} onClick={() => void onClick()}>
      {busy ? '⏳ Đang tạo…' : '📸 Tải ảnh'}
    </button>
  );
}

export function ResultPanel() {
  const { lang, pick } = useT();
  const main = useInterpret(s => s.main);
  const chatOpen = useInterpret(s => s.chatOpen);
  const tts = useInterpret(s => s.tts);
  const share = useInterpret(s => s.share);
  const quotaFrom = useInterpret(s => s.quotaFrom);
  const free = useInterpret(s => s.free);
  const sharedNote = useInterpret(s => s.sharedNote);
  const settings = useApp(s => s.aiSettings);
  const quota = quotaText({ quotaFrom, free }, settings, lang);
  const boxRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const bgOn = useAiCardsBg(boxRef);

  // Rời màn: dừng giọng đọc đang đọc lời giải
  useEffect(() => () => {
    try {
      if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    } catch {
      /* không có TTS */
    }
  }, []);

  const empty = !main && !chatOpen;
  return (
    <div className={'panel result-panel' + (empty ? ' is-empty' : '')} id="resultPanel">
      <div className={'section' + (bgOn ? ' bg-on' : '')} id="aiSection">
        <div id="aiCardsBg" className="ai-cards-bg" aria-hidden="true" ref={boxRef}></div>
        <div className="reading-head">
          <h3 id="readingProvider">{pick({ vi: '✦︎ Lời giải', en: '✦︎ Your reading' })}</h3>
          <span id="aiQuota" className="ai-quota" hidden={quota == null}>{quota ?? ''}</span>
          <div className="reading-tools">
            <button id="ttsBtn" title="Đọc bài giải" style={show(tts)} onClick={() => speak(outRef.current?.textContent || '')}>🔊 Đọc</button>
            <ShareImgButton visible={share} />
            <ShareLinkButton visible={share} />
          </div>
        </div>
        {main ? (
          <AiStream
            ref={outRef}
            id="aiOutput"
            view={main}
            lang={lang}
            className="ai-output"
            note={sharedNote ? pick({ vi: SHARED_NOTE_VI, en: SHARED_NOTE_EN }) : undefined}
          />
        ) : (
          <div id="aiOutput" className="ai-output ai-hint" ref={outRef}>
            {pick({
              vi: 'Viết câu hỏi, chọn kiểu trải, rút bài rồi bấm “Diễn giải” — lời giải sẽ hiện ở đây.',
              en: 'Write your question, pick a spread, draw the cards, then tap “Interpret” — your reading will appear here.',
            })}
          </div>
        )}
        <ChatFollow />
        <ReadingNote />
      </div>
    </div>
  );
}
