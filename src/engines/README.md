# engines/

Mã mệnh lệnh (imperative), **không có React**: canvas, Web Audio, Web Animations, rAF, timer. Component trong
`components/` / `features/` chỉ gắn engine vào phần tử của mình và nối cài đặt từ store vào.

## Quy ước

- **Engine có vòng chạy** là một hàm `start*(el, opts, cb?)` trả về một handle `{ …, stop() }`:
  - `startStarfield(cv, opts)` → `{ update(partial), burst(x, y, n), stop() }` — nền sao (components/Background).
  - `startSkyMap(cv, opts, { onInfo })` → `{ update(partial), setLocation(lat, lon, name), zoomBy, reset, clearSelection, stop() }` — bản đồ sao (features/sky).
  - `startAmbient(mode, vol)` → `{ setVolume(v), stop() }` — nhạc nền (components/AmbientMusic).
  - `startShuffle(el, n)` → `{ stop() }`; `startWheel(fan, opts)` → `{ cancel() }`; `dealBoard(...)` → hàm huỷ.
- `stop()` gỡ **mọi** listener / rAF / timer mà engine đã gắn và idempotent. Component gọi nó trong cleanup của effect.
- `update(partial)` chỉ đổi các khoá được truyền. Thao tác có tác dụng phụ (đổi nơi, phóng to…) là động từ riêng.
- Engine không đọc store hay ngôn ngữ: chữ giao diện, màu theme, cờ giảm chuyển động… đều do bên gọi truyền vào.
- Trạng thái cấp module chỉ dành cho tài nguyên dùng chung thật sự (AudioContext ở `audio.ts`, nơi vẽ hạt ở `burst.ts`),
  với `resetForTests()` khi cần. Engine đang chạy do component giữ, không do module giữ.
- Phần thuần (không DOM) tách riêng để test: `skyScene.ts` (`projectSky`, `drawBody`, `SKY_CITIES`), `zodiacWheel.ts`, `autoPickIndices`.
