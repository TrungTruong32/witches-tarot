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
