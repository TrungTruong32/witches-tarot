# Kế hoạch 2a — kết quả so ảnh chụp (bản cũ ↔ React)

Ngày chạy: 2026-11-20 · Công cụ: `node scripts/parity-screens.mjs [lọc-tên]` (Chrome đã cài, Playwright, pixelmatch ngưỡng 0.12).
Ảnh và ảnh khác biệt: `.superpowers/parity/` (không commit).

Phạm vi: landing, daily (Hôm nay), browse (Tra cứu), drawer (menu điện thoại), site (Cài đặt trang), ai (Cài đặt AI)
× điện thoại 390×844 / máy tính 1440×900 × VI/EN × tối/sáng — 44 cặp ảnh.
Animation/transition tắt, `Math.random` cố định, nền sao động (#bgStars/#bgAura, Kế hoạch 2c) ẩn, chờ font + mọi ảnh tải xong.

## Kết quả

| Màn | % điểm ảnh khác (khoảng) | Kết luận |
|---|---|---|
| landing | 0.07–0.87 | Khớp sau khi sửa (trước đó 2%: thiếu icon la bàn ở nút thương hiệu). Phần còn lại: răng cưa chữ |
| daily | 0–2.7 | Khớp. Chênh do lệch 1px dọc (xem dưới) |
| browse | 0.28–0.83 | Khớp. Chênh do góc nghiêng ngẫu nhiên của các lớp trong ô chất bài |
| drawer | 0–0.1 | Khớp |
| site | 0–1.6 | Khớp. Chênh do lệch 1px dọc (xem dưới) |
| ai | 0–0.05 | Khớp |

## Đã sửa

- **Nút thương hiệu trang mở đầu** (`#landingEnter`): bản cũ gắn icon `compass` qua `initIcons()` (ICON_OF) và bỏ ký hiệu `✧︎` khỏi nhãn.
  React hiển thị chữ thô → thêm `<IconLabel icon="compass">`. `IconLabel` chuyển từ NavMenu sang `components/Icon.tsx` để dùng chung.
  Test: `landing.test.tsx` "the brand button carries the compass icon…". Landing desktop: 1.98% → 0.08%.

## Khác biệt còn lại — không phải lỗi

- **Lệch 1px dọc ở thẻ `<select>`** (daily, site): CSS tính ra giống hệt, nhưng Chrome đo chiều cao select trước khi web font tải
  (font dự phòng cao hơn) và không đo lại. Ép bố cục lại thì cả hai đều 39px. Bản cũ tránh được vì màn ứng dụng bị ẩn tới khi vào.
  Phụ thuộc thời điểm tải font, không ổn định giữa các lần chạy.
- **Góc nghiêng `--j` của ô chất bài** (browse): bản cũ cũng ngẫu nhiên mỗi lần dựng; thứ tự gọi `Math.random` khác nhau → góc khác.
- **Răng cưa chữ/ảnh** dưới 1%.

## Ngoại lệ có chủ ý (đo ở các kế hoạch sau)

- **Tab Bốc bài** (spec §5.8, Kế hoạch 2b): dùng chung khối chọn kiểu trải + bàn trải với Trải bài AI, cuộn tự động,
  đổi tên nút ("🎲 Máy bốc ngẫu nhiên" / "✋ Tự tay chọn lá" kèm dòng gợi ý). So ảnh tab Bốc bài sẽ được đánh dấu "khác có chủ ý".
  **`/boc-bai` cố ý khác bản cũ (spec §5.8, Kế hoạch 2b Task 5):** thêm `#drawSpreadPicker` + bàn trải `#drawBoard`, rút xong cuộn tới bàn rồi chia lá,
  `.draw-card` hiện sau khi chia, tên kèm vị trí ("1. Quá khứ — …"). Không so ảnh màn này với bản cũ; chỉ dùng lại lớp CSS cũ, không thêm CSS mới.
