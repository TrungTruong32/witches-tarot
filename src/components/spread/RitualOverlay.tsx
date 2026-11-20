// Nghi thức trước khi bốc bài (#ritualOverlay, bản cũ L838–849; beginDraw L5102–5117). Gắn một lần trong Root.
// Chữ chỉ có tiếng Việt như bản cũ (không có trong I18N). Nút Bắt đầu mang icon 'shuffle' (initIcons L1411).
// Luôn có trong DOM như bản cũ (ô "Không hiện lần sau" giữ trạng thái giữa các lần mở); chỉ hiện khi store.ritual khác null.
import { useRef } from 'react';
import { useApp } from '../../app/store';
import { IconLabel } from '../Icon';

export function RitualOverlay() {
  const ritual = useApp(s => s.ritual);
  const disableRef = useRef<HTMLInputElement>(null);
  const q = ritual ? ritual.question.trim() : '';

  const go = (persist: boolean) => {
    const r = useApp.getState().ritual;
    if (!r) return;
    if (persist && disableRef.current?.checked) useApp.getState().setPref('ritualOff', true);
    useApp.getState().closeRitual();
    r.start();
  };

  return (
    <div id="ritualOverlay" className="ritual-overlay" style={{ display: ritual ? 'flex' : 'none' }}>
      <div className="ritual-box">
        <div className="ritual-candle"><span className="flame"></span><span className="wick"></span><span className="wax"></span></div>
        <div className="ritual-breathe"><span className="breathe-ring"></span><span className="breathe-txt">Hít thở</span></div>
        <p className="ritual-lead">Tĩnh tâm, hít thở sâu và giữ câu hỏi của bạn trong tâm trí…</p>
        <p className="ritual-q" id="ritualQ">{q ? '“' + q + '”' : ''}</p>
        <div className="ritual-actions">
          <button className="btn-primary" id="ritualStart" data-ico="shuffle" onClick={() => go(true)}>
            <IconLabel icon="shuffle" text="✦︎ Bắt đầu xào bài" />
          </button>
          <button id="ritualSkip" onClick={() => go(false)}>Bỏ qua</button>
        </div>
        <label className="ritual-off"><input type="checkbox" id="ritualDisable" ref={disableRef} /> Không hiện nghi thức lần sau</label>
      </div>
    </div>
  );
}
