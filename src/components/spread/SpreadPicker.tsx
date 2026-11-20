// Bộ chọn kiểu trải: các ô hình + nút ‹ › (bản cũ L2686–2731, markup L1004–1008).
import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { SPREADS, SPREAD_LAYOUT } from '../../core/spreads';
import { SPREAD_UI, layoutGeom } from '../../core/spreadUi';
import { useT } from '../../i18n/useT';
import { prefersReducedMotion } from '../../lib/media';

// Kiểu không có sơ đồ (free) vẽ 3 lá mờ theo ROW3 của bản cũ (cùng sơ đồ với ppf).
const ROW3 = SPREAD_LAYOUT.ppf!;

/** Sơ đồ nhỏ vị trí các lá trên ô (spreadArt). */
function SpreadArt({ k }: { k: string }) {
  const g = layoutGeom(SPREAD_LAYOUT[k] || ROW3);
  const ghost = !SPREAD_LAYOUT[k];
  return (
    <div className="sp-box" style={{ '--ar': g.ar } as CSSProperties}>
      {g.items.map((it, i) => (
        <span
          key={i}
          className={`sp-card${ghost ? ' ghost' : ''}`}
          style={{ left: it.left, top: it.top, width: it.width, height: it.height, ...(it.r ? { transform: 'rotate(90deg)' } : {}) }}
        />
      ))}
    </div>
  );
}

export interface SpreadPickerProps {
  value: string;
  onChange(k: string): void;
  id?: string;
}

export function SpreadPicker({ value, onChange, id = 'spreadPicker' }: SpreadPickerProps) {
  const { pick, lang } = useT();
  const en = lang === 'en';
  const boxRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const L = (a?: [string, string]) => (a ? (en ? a[1] : a[0]) : '');

  // syncPickerNav: bật/tắt ‹ › và bóng mờ hai đầu theo vị trí cuộn (đổi trực tiếp trên DOM như bản cũ).
  const sync = useCallback(() => {
    const box = boxRef.current, wrap = wrapRef.current;
    if (!box || !wrap) return;
    const prev = wrap.querySelector<HTMLButtonElement>('.picker-nav.prev');
    const next = wrap.querySelector<HTMLButtonElement>('.picker-nav.next');
    const atStart = box.scrollLeft < 4, atEnd = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
    if (prev) prev.disabled = atStart;
    if (next) next.disabled = atEnd;
    wrap.classList.toggle('more-left', !atStart);
    wrap.classList.toggle('more-right', !atEnd);
  }, []);

  // Cuộn ô đang chọn vào tầm nhìn khi gắn và khi đổi kiểu / ngôn ngữ.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const cur = box.querySelector<HTMLElement>('[aria-checked="true"]');
    if (cur) box.scrollLeft = Math.max(0, cur.offsetLeft - box.offsetLeft - 8);
    sync();
  }, [value, lang, sync]);

  useEffect(() => {
    const box = boxRef.current;
    box?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      box?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  const nav = (dir: number) => {
    const box = boxRef.current;
    box?.scrollBy({ left: dir * box.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className="picker-wrap" ref={wrapRef}>
      <button type="button" className="picker-nav prev" data-dir="-1" aria-label="Kiểu trải trước" onClick={() => nav(-1)}>‹</button>
      <div id={id} className="spread-picker" role="radiogroup" aria-label={pick({ vi: 'Kiểu trải bài', en: 'Spread type' })} ref={boxRef}>
        {SPREADS.map(sp => {
          const ui = SPREAD_UI[sp.k];
          const n = sp.pos ? sp.pos.length : 0, on = sp.k === value;
          const meta = L(ui?.t) + ' · ' + (n ? n + (en ? (n > 1 ? ' cards' : ' card') : ' lá') : en ? 'any count' : 'số lá tuỳ ý');
          const badge = on ? (en ? '✓ Selected' : '✓ Đang chọn') : L(ui?.b);
          return (
            <button
              key={sp.k}
              type="button"
              className="sp-tile"
              role="radio"
              aria-checked={on}
              data-k={sp.k}
              onClick={() => { if (sp.k !== value) onChange(sp.k); }}
            >
              {badge ? <span className="sp-badge">{badge}</span> : null}
              <div className="sp-art"><SpreadArt k={sp.k} /></div>
              <div className="sp-name">{L(ui?.n) || (en ? sp.en : sp.vi)}</div>
              <div className="sp-meta">{meta}</div>
              <div className="sp-desc">{L(sp.use || ui?.use)}</div>
            </button>
          );
        })}
      </div>
      <button type="button" className="picker-nav next" data-dir="1" aria-label="Kiểu trải tiếp" onClick={() => nav(1)}>›</button>
    </div>
  );
}
