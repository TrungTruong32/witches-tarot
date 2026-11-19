export type Lang = 'vi' | 'en';
export type Orientation = 'xuoi' | 'nguoc';
export type Element = 'fire' | 'water' | 'air' | 'earth';

/** Một dòng trong bảng `cards` của tarot.db (tên cột giữ nguyên tiếng Việt không dấu như dữ liệu gốc). */
export interface Card {
  id: number;
  deck: string | null;
  bo: string;
  so: string;
  ten: string;
  url?: string;
  mo_ta_hinh_anh?: string;
  y_nghia_xuoi: string;
  nghia_nguoc: string;
  tu_khoa?: string;
  than_thanh?: string;
  chiem_tinh_hoc?: string;
  cac_nguyen_to_lien_quan?: string;
  content?: string;
  image_url?: string;
}

export interface SpreadCard extends Card {
  orientation: Orientation;
  uid?: number;
}

/** card_en.json: bản dịch tiếng Anh của riêng bộ Witches, theo id lá. */
export type CardEnMap = Record<number, { kw: string; up: string; rev: string }>;

export interface CardText {
  ten: string;
  tu_khoa?: string;
  y_nghia_xuoi: string;
  nghia_nguoc: string;
}

/** Một lượt trải bài lưu trong nhật ký (IndexedDB `witchesTarotDecks` / store `readings`). */
export interface Reading {
  id?: number;
  ts: number;
  deck: string;
  question: string;
  provider: string;
  text: string;
  /** Hỏi tiếp — bản ghi cũ hoặc nhập từ file có thể thiếu. */
  followups?: { q: string; a: string }[];
  note?: string;
  spread?: string;
  positions?: string[] | null;
  facts?: string[];
  cards: Pick<SpreadCard, 'id' | 'deck' | 'ten' | 'bo' | 'so' | 'y_nghia_xuoi' | 'nghia_nguoc' | 'tu_khoa' | 'image_url' | 'orientation'>[];
  /** Nhập từ file sao lưu → chỉ nằm trong máy, không bao giờ đồng bộ lên máy chủ. */
  imported?: boolean;
}
