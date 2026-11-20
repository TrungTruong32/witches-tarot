# Witches Tarot — tài liệu vận hành

Dành cho người phát triển/vận hành. Giới thiệu sản phẩm xem [README](../README.md). Bản đang chạy: https://tt-witches-tarot.vercel.app
Chạy trên Vercel (project `tarot`, scope `trung-truong`); trải bài và lượt dùng AI lưu ở Supabase (project `witches-tarot`).

## Cấu trúc

| Đường dẫn | Là gì |
|---|---|
| `src/`, `index.html`, `vite.config.ts` | App React + TypeScript (Vite) — cấu trúc xem [README](../README.md), mục "Kỹ thuật" |
| `tests/legacy/witches_tarot.legacy.html` | Bản cũ (một file HTML) **đóng băng** — chỉ làm tham chiếu cho test so khớp, `parity-screens` và `upgrade-check` (chạy như app thật cùng `sw.js` cũ để thử nâng cấp); không sửa |
| `tarot.db` | Dữ liệu bộ bài (SQLite), build từ `Data/` bằng `Data/build_db.py` |
| `src/sw/` | Service worker — sinh lúc build (`scripts/build-sw.mjs` → `dist/sw.js`) với **hai cache tách riêng**: `wtarot-app-<hash>` (vỏ app, `/assets/*`, trang tải lúc chạy) và `wtarot-data-<hash>` (`tarot.db`, `card_en.json`, `sky.json`, icon, mặt lưng). Tên là hash nội dung nên tự đổi khi code hoặc dữ liệu đổi (không còn tăng `CACHE` bằng tay); đổi code không tải lại `tarot.db`. Lúc activate xoá mọi cache khác, kể cả `wtarot-v9` của bản cũ |
| `la-bai/` | Trang tĩnh cho SEO, build bằng `scripts/build_seo_pages.py` (chạy lại khi `tarot.db` đổi) |
| `api/` | API chạy trên Vercel: `ai.js` (AI miễn phí), `readings.js` (lưu trải bài), `llm.js` / `img.js` (proxy), `_guard.js` (hàng rào dùng chung) |
| `supabase/migrations/` | Cấu trúc database (chạy lại an toàn) |
| `scripts/` | Script chạy trên máy: build (copy-static, build-sw), kiểm tra trên Chrome thật (smoke, CSP, offline, nâng cấp từ bản cũ), deploy, cài Supabase, đẩy biến môi trường, Firewall |
| `vercel.json` | Route app (rewrite → `index.html`, `/x/` → 308 `/x`), cache `/assets` immutable, header bảo mật (CSP…) |
| `local/` | Trang xem lịch sử trải bài ở máy (không commit, xem `local/README.md`) |

**Dữ liệu bài không nằm trong git** (`tarot.db`, `card_en.json`, `la-bai/`, `Data/*.json|xlsx|db` — xem `.gitignore`): repo công khai chỉ có code. Deploy vẫn kèm dữ liệu vì `vercel deploy` tải thư mục làm việc ở máy lên (lọc bằng `.vercelignore`, có dữ liệu bài) và Vercel chạy `npm run build` (chép dữ liệu vào `dist/`). Bản duy nhất nằm ở máy này → **sao lưu** thư mục dự án.

`.env` chứa mọi khoá bí mật — **không bao giờ commit** (đã có trong `.gitignore` và `.vercelignore`). `test.ipynb` cũng chứa key, không commit.

## Deploy

```bash
git add … && git commit -m "…"     # hai script deploy từ chối chạy nếu còn thay đổi chưa commit
node scripts/deploy-preview.mjs     # nhánh bất kỳ: check → vercel deploy (Preview, Vercel build) → kiểm tra → smoke-flows trên URL preview
node scripts/deploy-prod.mjs        # chỉ từ main: check → vercel deploy --prod → kiểm tra trang + API
```

Deploy **chỉ từ máy này** (không nối Git với Vercel): `vercel deploy` tải thư mục làm việc (đã lọc bằng `.vercelignore`, có dữ liệu bài) lên và Vercel chạy `npm run build`; phiên bản (git hash ở máy) đi qua `--build-env APP_VERSION` vì máy chủ không có `.git`. Không dùng `vercel build` + `--prebuilt` vì trên Windows `vercel build` hỏng khi cài builder (EPERM symlink, cần Developer Mode). Phiên bản Vercel CLI được ghim trong `scripts/deploy-lib.mjs` (`VERCEL_CLI`), nâng thì sửa ở đó.

Script dùng `VERCEL_TOKEN` trong `.env`: kiểm tra định dạng (`[A-Za-z0-9_-]+`), truyền cho Vercel CLI qua **biến môi trường** của tiến trình con (không đặt trên dòng lệnh), output luôn được che token. Phiên bản đọc **chỉ** từ `.vercel/output/static/index.html` (thiếu file → dừng, không dùng `dist/` thay).

Kiểm tra sau deploy: `app-version` trên `/` phải khớp bản build ở máy (từ chối bản `'dev'`), `/trai-bai` 200 + có app, `/trai-bai/` → 308, `/la-bai/`, `/sitemap.xml`, `/robots.txt`, `/sw.js` 200, `/api/readings` + `/api/ai` body rỗng → 400 (không ghi gì). Riêng Preview:

- bị Deployment Protection (401/403) → in dòng `UNVERIFIED — Deployment Protection is on`, **không** chạy smoke, thoát mã **2** (không phải 0);
- `/api/readings` hoặc `/api/ai` trả 503 → chỉ cảnh báo "API env vars not set for Preview" (biến môi trường đang chỉ đặt cho Production), smoke vẫn chạy. Trên Production 503 vẫn là lỗi;
- smoke-flows chạy trên URL preview (`/api` luôn giả lập); lỗi 404 của `/_vercel/*` là nhiễu đã biết nên không tính, mọi lỗi console khác vẫn tính.

### Kiểm tra trên Chrome thật (chạy `npm run build` trước)

```bash
node scripts/smoke-flows.mjs [BASE]   # các luồng chính (dev server, hoặc BASE có sẵn); /api luôn giả lập
node scripts/csp-check.mjs            # dist/ với đúng header vercel.json: không vi phạm CSP nào
node scripts/offline-check.mjs        # SW: xoá cache cũ, build chỉ đổi meta không tải lại, đổi code giữ cache dữ liệu, offline vẫn mở
node scripts/upgrade-check.mjs        # nâng cấp thật từ bản cũ (wtarot-v9) lên bản React trên CÙNG origin + link chia sẻ cũ
node scripts/parity-screens.mjs [màn] # so ảnh bản cũ ↔ bản React
```

`upgrade-check` chỉ dùng `127.0.0.1`: cổng P phục vụ bản cũ đóng băng + `sw.js` cũ (lấy từ git `d5af282`), tạo dữ liệu bằng chính code cũ, rồi tắt và phục vụ `dist/` trên cùng cổng P (cùng origin) để kiểm tra dữ liệu được giữ.

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
| `BACKFILL_UNTIL`, `BACKFILL_TOTAL_MAX` | Hạn chót (YYYY-MM-DD) và tổng số trải bài cũ được đồng bộ từ trình duyệt | 2027-01-31 / 5000 |

## Supabase

```bash
node scripts/setup-supabase.mjs     # tạo/dùng lại project, chạy mọi migration, ghi SUPABASE_* vào .env
```

Chạy lại an toàn — dùng mỗi khi thêm file vào `supabase/migrations/`. Lần đầu cài thì tiếp theo chạy `push-vercel-env.mjs` + deploy.
Các bảng bật RLS, trình duyệt không đọc/ghi trực tiếp được; chỉ API phía server (service key) truy cập. Không lưu IP / email / tên.

**Chỉ body, không query string:** server gọi Supabase qua hàm RPC (`POST /rest/v1/rpc/<hàm>`, tham số trong body JSON) — `ai_usage_claim/release/set_provider`, `readings_counts/insert`, `readings_list/stats` (migration `20261119130000_rpc_body_only.sql`). Tham số có kiểu, không SQL động → chống SQL injection; chỉ `service_role` được EXECUTE. Thêm truy vấn mới thì viết thành hàm như vậy, **không** ghép giá trị vào URL kiểu `?cot=eq.${x}`.

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

- script: **chỉ chính site** + đúng một script inline (đoạn đặt theme sớm trong `index.html`, tránh nháy màu) được cho phép bằng **hash sha256** — không có `'unsafe-inline'`. `tests/repo/csp.test.ts` kiểm tra mọi script inline đều có hash trong CSP: sửa đoạn script đó thì phải cập nhật hash `'sha256-…'` trong `vercel.json` (test báo hash mới). `'wasm-unsafe-eval'` là cho sql.js — giờ được **đóng gói cùng app** (npm `sql.js`, file `.wasm` phục vụ từ chính site), không còn tải từ CDN
- style: chính site, inline · font: **chỉ chính site** (font tự host qua `@fontsource` + bản cắt ký hiệu trong `src/assets/fonts/`, xem `src/styles/fonts.css`; không còn Google Fonts)
- ảnh: mọi `https:`, `data:`, `blob:`
- kết nối (fetch): chính site, mọi `https:` (AI gọi trực tiếp bằng key riêng), `http://localhost` / `127.0.0.1` (Ollama chạy ở máy)
- không cho trang khác nhúng site vào iframe
- `Permissions-Policy`: tắt camera, micro, thanh toán, USB; `geolocation=(self)` — chỉ chính site được hỏi vị trí (bản đồ bầu trời dùng GPS)

Kiểm tra trên trình duyệt: `node scripts/csp-check.mjs` (sau `npm run build`).

## Xem lịch sử trải bài

```bash
node local/serve.mjs    # mở http://localhost:5555 — chỉ chạy ở máy, đọc khoá trong .env
```

Chi tiết trong `local/README.md`.
