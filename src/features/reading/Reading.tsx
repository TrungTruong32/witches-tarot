// Màn "Trải bài AI": hai cột (lưới .reading, CSS bản cũ) — bước 1–4 bên trái, lời giải bên phải (markup L986–1075).
import { Steps } from './Steps';

export function Reading() {
  return (
    <div className="reading">
      <Steps />
      {/* Cột lời giải: Task 7 dựng phần AI (AiStream, hỏi tiếp, TTS, chia sẻ, ghi chú). Giữ khung + lớp is-empty như bản cũ. */}
      <div className="panel result-panel is-empty" id="resultPanel">
        <div className="section" id="aiSection"></div>
      </div>
    </div>
  );
}
