# Witches Tarot — tài liệu vận hành

Dành cho người phát triển/vận hành. Giới thiệu sản phẩm xem [README](../README.md). Bản đang chạy: https://tt-witches-tarot.vercel.app
Chạy trên Vercel (project `tarot`, scope `trung-truong`); trải bài và lượt dùng AI lưu ở Supabase (project `witches-tarot`).

## Cấu trúc

| Đường dẫn | Là gì |
|---|---|
| `witches_tarot.html` | Toàn bộ app (HTML + CSS + JS trong một file) — sửa trực tiếp file này |
| `tarot.db` | Dữ liệu bộ bài (SQLite), build từ `Data/` bằng `Data/build_db.py` |
| `sw.js` | Service worker — **tăng `CACHE`** (v8 → v9…) mỗi khi đổi `tarot.db`, icon, mặt lưng bài |
| `la-bai/` | Trang tĩnh cho SEO, build bằng `scripts/build_seo_pages.py` (chạy lại khi `tarot.db` đổi) |
| `api/` | API chạy trên Vercel: `ai.js` (AI miễn phí), `readings.js` (lưu trải bài), `llm.js` / `img.js` (proxy), `_guard.js` (hàng rào dùng chung) |
| `supabase/migrations/` | Cấu trúc database (chạy lại an toàn) |
| `scripts/` | Script chạy trên máy: cài Supabase, đẩy biến môi trường, deploy, Firewall |
| `vercel.json` | Rewrite `/` → app, header bảo mật (CSP…) |
| `local/` | Trang xem lịch sử trải bài ở máy (không commit, xem `local/README.md`) |

**Dữ liệu bài không nằm trong git** (`tarot.db`, `card_en.json`, `la-bai/`, `Data/*.json|xlsx|db` — xem `.gitignore`): repo công khai chỉ có code. Deploy vẫn kèm dữ liệu vì `deploy-prod.mjs` tải file trong máy lên Vercel. Bản duy nhất nằm ở máy này → **sao lưu** thư mục dự án.

`.env` chứa mọi khoá bí mật — **không bao giờ commit** (đã có trong `.gitignore` và `.vercelignore`). `test.ipynb` cũng chứa key, không commit.

## Deploy

```bash
git add … && git commit -m "…"     # deploy-prod từ chối chạy nếu còn thay đổi chưa commit
node scripts/deploy-prod.mjs        # deploy bản HEAD lên Production rồi tự kiểm tra trang + API
```

Script dùng `VERCEL_TOKEN` trong `.env` (không in ra).

## Đổi key AI, model, hạn mức

Web **không đọc `.env`** — nó đọc biến môi trường trong cài đặt project trên Vercel. Đổi xong phải đẩy lên **và** deploy lại:

1. Sửa giá trị trong `.env` (ví dụ `GEMINI_API_KEY=...`)
2. `node scripts/push-vercel-env.mjs` — đẩy lên Vercel (Production), ghi đè giá trị cũ, không in key ra
3. `node scripts/deploy-prod.mjs` — **bắt buộc**: Vercel chỉ áp biến mới cho bản deploy mới. Code không đổi vẫn deploy được; cuối script báo `/api/ai` đã có key chưa.

Lưu ý:
- Xoá một dòng khỏi `.env` **không** xoá biến trên Vercel. Muốn bỏ hẳn: dashboard Vercel → project `tarot` → Settings → Environment Variables → xoá → deploy lại.
- Nghi key bị lộ: **thu hồi key cũ** ở trang nhà cung cấp (Google AI Studio / OpenRouter / Ollama) trước, rồi mới làm 3 bước trên.

Các biến script đẩy lên (nếu có trong `.env`):

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Kết nối Supabase (bắt buộc) | — |
| `GEMINI_API_KEY`, `OLLAMA_API_KEY`, `OPENROUTER_API_KEY` | Key AI miễn phí — cần ít nhất một; thử lần lượt Gemini → Ollama → OpenRouter | — |
| `GEMINI_MODELS` (hoặc `GEMINI_MODEL`), `OLLAMA_MODEL`, `OPENROUTER_MODEL` | Đổi model | Gemini: tự dò Flash/Flash-Lite · `gpt-oss:120b` · `openrouter/free` |
| `AI_DEVICE_DAILY`, `AI_IP_DAILY`, `AI_GLOBAL_DAILY` | Lượt AI miễn phí mỗi ngày: mỗi thiết bị / mỗi mạng / toàn site | 10 / 30 / 600 |
| `AI_HASH_SECRET` | Bí mật dùng khi băm IP (không lưu IP thô) | dùng service key |
| `READINGS_DAILY_MAX` | Số trải bài mới được lưu mỗi 24 giờ (toàn site) | 1500 |
| `READINGS_MAX_MB` | Ngừng lưu khi database đạt dung lượng này (gói free 500MB) | 350 |
| `READINGS_MAX_ROWS` | Trần số bản ghi dự phòng (khi chưa có hàm đo dung lượng) | 6000 |
| `BACKFILL_UNTIL`, `BACKFILL_TOTAL_MAX` | Hạn chót (YYYY-MM-DD) và tổng số trải bài cũ được đồng bộ từ trình duyệt | 2027-01-31 / 5000 |

## Supabase

```bash
node scripts/setup-supabase.mjs     # tạo/dùng lại project, chạy mọi migration, ghi SUPABASE_* vào .env
```

Chạy lại an toàn — dùng mỗi khi thêm file vào `supabase/migrations/`. Lần đầu cài thì tiếp theo chạy `push-vercel-env.mjs` + deploy.
Các bảng bật RLS, trình duyệt không đọc/ghi trực tiếp được; chỉ API phía server (service key) truy cập. Không lưu IP / email / tên.

## Chống spam / DDoS

Các lớp đang chạy:

1. **Vercel DDoS mitigation** — tự bật cho mọi project.
2. **Vercel Firewall**, luật `RL api`: `/api/*` và `/tarot.db` tối đa 120 request / phút / IP, vượt → 429 (chặn ở biên mạng, không tính tiền, không chạm tới code). Vercel đếm gần đúng nên thực tế chặn khi vượt rõ rệt; IP được mở lại sau ~1 phút. Gói Hobby chỉ cho **một** luật rate limit.
3. **Trong code** (`api/_guard.js`): giới hạn theo IP / theo instance, giới hạn kích thước body, timeout. Chỉ đếm trong RAM của từng instance → giảm tải, không thay được Firewall.
4. **Trần trong Supabase**: hạn mức AI theo ngày, trải bài/ngày, dung lượng database.

Quản lý luật Firewall:

```bash
node scripts/setup-firewall.mjs             # tạo/cập nhật nháp luật ở chế độ CHỈ GHI LOG
node scripts/setup-firewall.mjs --enforce   # tạo/cập nhật nháp ở chế độ CHẶN (429)
node scripts/setup-firewall.mjs --publish   # in thay đổi + mã xác nhận (Vercel bắt người duyệt)
node scripts/setup-firewall.mjs --publish --confirm <mã>   # áp dụng lên Production
node scripts/setup-firewall.mjs --inspect   # xem cấu hình luật đang chạy + thống kê
```

Chạy lại **không** kèm `--enforce` sẽ đưa luật về chỉ ghi log.
Đang bị tấn công dữ dội từ nhiều IP: dashboard Vercel → Firewall → bật **Attack Challenge Mode** (chỉ bật bằng tay).

## Header bảo mật (CSP)

`vercel.json` đặt Content-Security-Policy cho mọi trang. Thêm script / font / iframe từ **host mới** thì phải thêm host đó vào CSP, nếu không trình duyệt sẽ chặn âm thầm. Đang cho phép:

- script: chính site, inline, `cdnjs.cloudflare.com` (sql.js, cần `'wasm-unsafe-eval'`)
- style: chính site, inline, `fonts.googleapis.com` · font: `fonts.gstatic.com`
- ảnh: mọi `https:`, `data:`, `blob:`
- kết nối (fetch): chính site, mọi `https:` (AI gọi trực tiếp bằng key riêng), `http://localhost` / `127.0.0.1` (Ollama chạy ở máy)
- không cho trang khác nhúng site vào iframe

## Xem lịch sử trải bài

```bash
node local/serve.mjs    # mở http://localhost:5555 — chỉ chạy ở máy, đọc khoá trong .env
```

Chi tiết trong `local/README.md`.
