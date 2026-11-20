// Màn "Trải bài AI": hai cột (lưới .reading, CSS bản cũ) — bước 1–4 bên trái, lời giải bên phải (markup L986–1075).
import { ResultPanel } from './ResultPanel';
import { Steps } from './Steps';

export function Reading() {
  return (
    <div className="reading">
      <Steps />
      <ResultPanel />
    </div>
  );
}
