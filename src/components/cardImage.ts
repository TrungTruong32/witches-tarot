// Kích thước ảnh lá bài (tarot.vn): đo thực tế 300–307 × 512 (tỉ lệ cao/rộng 1,67–1,71) ở cả Witches và Rider-Waite.
// Dùng làm thuộc tính width/height: trình duyệt giữ chỗ đúng tỉ lệ trước khi ảnh tải xong → không xô bố cục (CLS).
export const CARD_IMG_W = 307;
export const CARD_IMG_H = 512;

/** fetchpriority="high" — React 18 chưa nhận prop `fetchPriority` (cảnh báo ở bản dev), nên gắn thuộc tính chữ thường
 *  qua spread; React chuyển nguyên thuộc tính chữ thường xuống DOM. */
export const FETCH_HIGH = { fetchpriority: 'high' } as Record<string, string>;
