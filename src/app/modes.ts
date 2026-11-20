// Các màn hình (tên "mode" như bản cũ, CSS dùng body[data-mode]) ↔ đường dẫn.
export type Mode = 'daily' | 'browse' | 'draw' | 'reading' | 'history' | 'yesno' | 'sky';

export const PATH_BY_MODE: Record<Mode, string> = {
  daily: '/hom-nay',
  browse: '/tra-cuu',
  draw: '/boc-bai',
  reading: '/trai-bai',
  history: '/nhat-ky',
  yesno: '/yes-no',
  sky: '/bau-troi',
};

export const MODE_BY_PATH: Record<string, Mode> = Object.fromEntries(
  Object.entries(PATH_BY_MODE).map(([m, p]) => [p, m as Mode]),
);

/** id phần tử gốc của từng màn hình (CSS cũ và các engine tham chiếu theo id). */
export const VIEW_ID: Record<Mode, string> = {
  daily: 'dailyView',
  browse: 'browseView',
  draw: 'drawView',
  reading: 'readingView',
  history: 'historyView',
  yesno: 'yesnoView',
  sky: 'skyView',
};

/** location.state gửi sang màn Trải bài khi vào từ ô hỏi ở trang mở đầu: điền câu hỏi rồi tự bấm "Tự tay chọn lá". */
export interface ReadingEntryState {
  question: string;
  autoPick: true;
}
