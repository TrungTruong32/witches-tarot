Bỏ file JSON của bộ bài mới vào thư mục này để "chốt" vĩnh viễn (mọi người vào web đều thấy).

- Tên file = tên bộ bài. Ví dụ: "Rider-Waite.json" -> bộ bài "Rider-Waite".
- JSON là một mảng (list) các lá bài. Các field khớp tên sẽ được dùng:
  bo, so, ten, url, mo_ta_hinh_anh, y_nghia_xuoi, tu_khoa, than_thanh,
  chiem_tinh_hoc, cac_nguyen_to_lien_quan, nghia_nguoc, content, image_url
  (thiếu field nào để trống).
- Sau khi thêm file, chạy lại:  python build_db.py   (trong thư mục Data)
  rồi deploy lại (vercel --prod).

Muốn thử nhanh mà không cần build/deploy: dùng nút "Import bộ bài (JSON)" ngay trên web
— bộ đó lưu trong trình duyệt của bạn (IndexedDB), chỉ mình bạn thấy.
