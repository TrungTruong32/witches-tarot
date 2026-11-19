# Chuyển Witches Tarot sang React + TypeScript — Thiết kế

Ngày: 2026-11-19 · Trạng thái: chờ duyệt

## 1. Mục đích và lý do

Toàn bộ app hiện nằm trong một file `witches_tarot.html` (~5.900 dòng: ~780 CSS, ~500 HTML, ~4.550 JS với ~246 hàm trong một thẻ `<script>`), không module, không build, không test.

Chủ dự án dùng repo này đi phỏng vấn **AI Engineer**. Hai đối tượng cần thấy "chuyên nghiệp":
1. **Người phỏng vấn đọc code trên GitHub** — ưu tiên **trước** (đợt này).
2. **Người dùng thấy giao diện** — làm **sau**, đợt riêng.

Chủ dự án đã chọn: **Vite + React + TypeScript, viết lại phần giao diện thành component**.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu**
- Cấu trúc thư mục rõ, TypeScript `strict`, component React, logic thuần tách khỏi UI.
- Phần "AI" (dựng prompt, SPREAD FACTS, gọi API stream, fallback, chia sẻ) là code thuần **có test** — đây là phần người phỏng vấn AI Engineer sẽ đọc kỹ nhất.
- Bỏ `'unsafe-inline'` khỏi `script-src` trong CSP.
- Lint + typecheck + test chạy được bằng một lệnh; CI GitHub Actions chạy chúng trên mỗi push.

**Không làm (đợt này)**
- Không thiết kế lại giao diện. **Giữ giống bản hiện tại** (layout, màu, animation, chữ). Đổi giao diện là đợt sau.
- Không đổi `api/` về hành vi; không đổi Supabase schema; không đổi pipeline Python (`Data/`, `scripts/build_seo_pages.py`, `la-bai/`).
- Không thêm tính năng mới.

**Thất bại nếu (dù build chạy được)**
- Người dùng cũ **mất dữ liệu**: lịch sử trải bài (IndexedDB `witchesTarotDecks` v2), ghi chú, cài đặt (localStorage), `tarotDeviceId`.
- **Link chia sẻ cũ** (`/#r=...`) không mở được.
- App đã cài (PWA) kẹt bản cũ hoặc hết chạy offline.
- Trang SEO `/la-bai/...`, `/sitemap.xml`, `/robots.txt`, `/api/*` bị SPA fallback nuốt mất.
- Mất animation đặc trưng (xào bài xoáy/riffle, chồng bài 3D, bánh xe bài, bản đồ sao) hoặc chạy giật hơn rõ rệt.

## 3. Ràng buộc cần giữ nguyên (hợp đồng tương thích)

| Thứ | Giá trị phải giữ |
|---|---|
| localStorage keys | `witchesTarotAI` (cài đặt AI + key riêng của người dùng, JSON), `witchesTarotDeck`, `cardBack`, `dailyNote:*`, `tarotAmbient`, `tarotAmbientMode`, `tarotAmbientVol`, `tarotCloudBackfill`, `tarotCloudSave`, `tarotDeviceId`, `tarotFx`, `tarotLang`, `tarotRitual`, `tarotSkyCity`, `tarotSkyLayers`, `tarotSkyLoc`, `tarotSkyMode`, `tarotSound`, `tarotSoundVol`, `theme` — cùng tên, cùng định dạng giá trị |
| IndexedDB | DB `witchesTarotDecks`, version 2, cùng store/định dạng bản ghi |
| Link chia sẻ | `#r=<encodeShare(...)>` — `decodeShare` phải đọc được link cũ |
| API client gọi | `POST /api/ai` body `{device_id, lang, deck, messages}`, stream text; `/api/llm` (proxy BYOK/Ollama); `POST /api/readings` (đơn lẻ + `batch`) |
| Dữ liệu tĩnh | `tarot.db` (sql.js 1.10.3, WASM), `card_en.json` (nạp lười), `sky.json`, cardback, icon — **git-ignored**, deploy từ máy |
| Theme không nháy | theme đọc từ localStorage **trước** khi vẽ trang (hiện là inline script dòng 833) |
| Deploy | `scripts/deploy-prod.mjs` từ chối khi còn thay đổi chưa commit, deploy rồi tự kiểm tra trang + API |

## 4. Các hướng đã cân nhắc

| Hướng | Đổi được gì | Đánh đổi | Kết quả |
|---|---|---|---|
| A. Vite + TS thuần, tách module | Rủi ro thấp, giữ nguyên DOM code | Không có React; đổi giao diện sau phải viết lại `ui/` lần nữa | Không chọn |
| **B. Vite + React + TS, viết lại UI** | Stack quen thuộc nhất với nhà tuyển dụng; đợt đổi giao diện sau dễ | Viết lại ~4.500 dòng; animation dễ hỏng; lâu mới có bản chạy | **Chủ dự án chọn** |
| C. Next.js | Gộp SEO + API | Quá nặng; phải đổi `api/` và pipeline SEO Python đang chạy tốt; app không cần SSR | Loại |

## 5. Thiết kế

### 5.1 Stack (quyết định của Claude, chủ dự án có thể sửa)
- **Vite + React 18 + TypeScript strict**. Node 22+ (máy đang có Node 25).
- **State**: Zustand cho trạng thái toàn app (ngôn ngữ, cài đặt, bộ bài, trải bài hiện tại). Lý do: nhẹ, ít boilerplate, dễ test; persist **tự viết** qua lớp `storage` để giữ đúng key/định dạng cũ (không dùng middleware persist mặc định vì nó đổi định dạng).
- **Routing**: `react-router` với đường dẫn thật cho 7 màn hình (`/`, `/tra-cuu`, `/boc-bai`, `/trai-bai`, `/nhat-ky`, `/hom-nay`, `/yes-no`, `/bau-troi` — tên cuối cùng do builder chốt). Hash `#r=` vẫn xử lý ở `/` để link cũ chạy.
- **CSS**: chuyển CSS hiện có sang **CSS Modules theo component** + một file `tokens.css` (biến theme) và `global.css`. **Không** Tailwind đợt này (đợt đổi giao diện sẽ quyết định).
- **i18n**: giữ cơ chế từ điển VI/EN hiện có, đưa thành `i18n/vi.ts`, `i18n/en.ts` + hook `useT()`; không thêm thư viện.
- **Test**: Vitest (logic thuần + hook), React Testing Library (vài component chính), Playwright (smoke test luồng chính trên bản build).
- **Chất lượng**: ESLint + Prettier, `tsc --noEmit`, GitHub Actions chạy lint/typecheck/test.
- **PWA**: `vite-plugin-pwa` (Workbox, precache asset có hash). `tarot.db`, ảnh, `sky.json` cache-first; HTML network-first như cũ. Service worker mới phải xoá cache cũ `wtarot-v*`.

### 5.2 Cấu trúc thư mục
```
src/
  core/            logic thuần, không đụng DOM/React — test kỹ nhất
    cards/         kiểu Card, tương ứng huyền học, tìm lá thông minh
    spreads/       sơ đồ vị trí 12 kiểu trải
    facts/         SPREAD FACTS (bước 1 luận giải)
    prompt/        buildSystemPrompt, dựng tin nhắn người dùng
    share/         encodeShare / decodeShare
    astro/         tuần trăng, vị trí hành tinh (Schlyter)
  services/        I/O: sql.js (tarot.db), aiClient (stream + fallback BYOK/Ollama/free), readingsApi, idb (nhật ký), storage (localStorage)
  engines/         code mệnh lệnh giữ nguyên tinh thần, bọc lại bằng TS: skyMap (canvas), ambientAudio, cardSfx, shuffleAnim, starfield, shareImage
  features/        mỗi màn hình một thư mục: components + hooks
    landing/ browse/ draw/ reading/ history/ daily/ yesno/ sky/ settings/
  components/      UI dùng chung: Card, CardStack3D, Drawer, NavDome, Modal…
  store/           Zustand stores
  i18n/
  styles/          tokens.css, global.css
api/               giữ nguyên (JS), chỉ thêm test cho hàm thuần nếu tách được
```

### 5.3 Nguyên tắc chuyển animation / canvas / âm thanh
Không viết lại các phần vẽ/âm thanh phức tạp thành render React. Chúng thành module trong `engines/` có API rõ (`start/stop/update`) và được gắn vào component bằng `useRef` + `useEffect`. React lo trạng thái và bố cục; engine lo khung hình. Đây là cách giữ nguyên độ mượt và giảm rủi ro.

### 5.4 Cách làm và triển khai (theo giai đoạn)
1. **Nền móng**: dựng Vite/TS/ESLint/Vitest/CI; chuyển CSS; tách `core/` + `services/` và viết test (snapshot prompt, SPREAD FACTS, encode/decode share với link mẫu cũ, tương thích storage).
2. **Từng màn hình**: landing → browse → draw/reading (bộ máy bốc bài dùng chung) → history → daily → yes/no → sky → settings. Mỗi màn hình xong thì so với bản cũ theo checklist.
3. **Chuyển đổi**: PWA mới, CSP mới, cập nhật `vercel.json` (SPA fallback **loại trừ** `/api`, `/la-bai`, file tĩnh) và `deploy-prod.mjs` (build `dist/` + chép dữ liệu git-ignored vào rồi deploy). Chạy Playwright trên bản Preview; đạt checklist mới đẩy Production.

Làm trên nhánh `react-migration` **ở máy**, commit theo từng bước, **không push** giữa chừng. File `witches_tarot.html` cũ giữ nguyên trên `main` và vẫn là bản Production cho đến khi bước 3 đạt. Sau khi chuyển xong mới xoá.

**Quyết định của chủ dự án:**
- Không cần mốc công khai sớm. Làm xong hết, đạt checklist, merge vào `main`, **push lên GitHub một lần** rồi deploy Production.
- **Bản cũ đóng băng** trong suốt quá trình: chủ dự án không sửa `witches_tarot.html` nữa. Mục tiêu "giống bản cũ" là bản tại thời điểm bắt đầu (gồm cả các thay đổi chưa commit hiện có trong `api/` và `witches_tarot.html`, sẽ được commit trước khi rẽ nhánh).

### 5.5 Checklist "giống bản cũ" (điều kiện cắt sang Production)
- 7 màn hình + drawer/menu vòm trời + cài đặt hoạt động như cũ, cả VI và EN, cả 4 theme.
- Trải bài AI: free endpoint stream, BYOK Gemini, Ollama local, hỏi tiếp, đọc to, xuất ảnh, chia sẻ link.
- Mở được ít nhất 3 link chia sẻ thật tạo từ bản cũ.
- Máy đã dùng bản cũ: sau khi cập nhật vẫn thấy lịch sử, ghi chú, cài đặt, mặt lưng bài đã chọn.
- Offline: cài PWA, tắt mạng, mở lại vẫn tra cứu và bốc bài được.
- `/la-bai/...`, `/sitemap.xml`, `/robots.txt`, `/api/*` trả đúng.
- CSP không còn `'unsafe-inline'` trong `script-src`, console không lỗi CSP.
- Lighthouse Performance trên mobile không thấp hơn bản cũ quá 5 điểm.

## 5.6 Quyết định thêm sau khi review (quyết định của Claude, chủ dự án có thể sửa)
- **Prompt AI dùng chung một nguồn.** Hiện `api/ai.js` (`systemPrompt`) là bản sao của `buildSystemPrompt` phía client. Đưa về một module `shared/prompt` mà cả client lẫn `api/ai.js` cùng import. Có test snapshot chứng minh output **giống hệt từng byte** bản cũ (cả VI/EN, cả 2 bộ bài). Lưu ý: bản server có thêm đúng một dòng hướng dẫn cho câu hỏi tiếp ("For follow-up questions…" / "Với câu hỏi tiếp theo…") mà bản client không có → module nhận tuỳ chọn `followups` để mỗi bên giữ đúng output của mình. `GUARD` vẫn chỉ ở server. Đây là thay đổi cấu trúc, không đổi hành vi API.
- **Dữ liệu test.** Dữ liệu lá bài là riêng tư, không đưa lên repo. Test dùng **fixture tự tạo** (vài lá giả + một `tarot.db` nhỏ dựng bằng script trong test). Playwright chạy ở máy, nhắm vào bản Preview có dữ liệu thật; CI chạy lint, typecheck, Vitest, không chạy Playwright.
- **Build và deploy.** Build Vite ở máy, chép dữ liệu git-ignored (`tarot.db`, `card_en.json`, `sky.json`, `la-bai/`…) vào `dist/`, rồi deploy kiểu prebuilt. `deploy-prod.mjs` thêm bước build. Bước tự kiểm tra sau deploy thay chuỗi `cloudSaveReading` (sẽ mất khi bundle) bằng một dấu hiệu khác, ví dụ thẻ meta phiên bản. Có thêm lệnh deploy Preview để chạy Playwright.

## 5.7 Ràng buộc vận hành (từ chủ dự án, qua phiên làm việc khác)
- **Deploy chỉ từ máy này** bằng `node scripts/deploy-prod.mjs`. **Không** nối repo GitHub với Vercel (deploy theo Git sẽ thiếu dữ liệu lá bài và làm hỏng site).
- **Dữ liệu lá bài không vào git:** `tarot.db`, `card_en.json`, `la-bai/`, `Data/*.json|xlsx|db` (trừ `Data/template.json`). Nếu di chuyển hoặc đổi tên (ví dụ sang `public/` hay `dist/`), phải sửa **cả** `.gitignore` (giữ dữ liệu ngoài GitHub) **lẫn** `.vercelignore` (để deploy vẫn kèm dữ liệu). Vercel chỉ đọc `.vercelignore`.
- **Supabase:** không lọc bằng query string. Mọi truy vấn là hàm RPC Postgres có kiểu, nằm trong migration mới ở `supabase/migrations/`, gọi `POST /rest/v1/rpc/<fn>` với body JSON. Phải thử migration trên Postgres + PostgREST tạm bằng Docker, chạy `node scripts/setup-supabase.mjs` **trước** khi deploy code gọi hàm đó, và chỉ cấp EXECUTE cho `service_role`. (Đợt này không dự kiến thêm truy vấn mới.)
- **Git:** commit bằng danh tính `TrungTruong32` đã cấu hình sẵn trong repo, không dùng tài khoản công ty. Chỉ push khi chủ dự án yêu cầu.
- **Bất biến bảo mật của API phải giữ:** `cleanMessages` và system prompt do server tự dựng trong `api/ai.js`; allowlist bộ bài trong `api/readings.js`; `/api/img` giữ phương thức GET (CDN cache, chỉ cho host tarot.vn). Module prompt dùng chung (mục 5.6) chỉ đổi chỗ đặt code, server vẫn tự dựng prompt và vẫn bỏ tin `system` của client.
- **PWA:** cache của `tarot.db`, icon và mặt lưng bài phải được làm mới mỗi khi các file đó đổi. Với Workbox thì hash nội dung tự lo việc này, nhưng file nào cấu hình cache-first ngoài precache thì phải có phiên bản rõ ràng.

## 6. Để builder tự quyết
Tên route cụ thể; cách chia component chi tiết; thư viện nhỏ (ví dụ clsx); cách tổ chức test; thứ tự nhỏ trong mỗi giai đoạn; có chuyển `api/` sang TS hay không (chỉ khi không đổi hành vi).
