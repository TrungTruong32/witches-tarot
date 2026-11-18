-- Đếm lượt dùng "AI miễn phí" (/api/ai) để giới hạn mỗi thiết bị / mỗi mạng / toàn hệ thống mỗi ngày.
-- KHÔNG lưu IP thô: ip_hash = SHA-256(bí mật server + ngày + IP), đổi mỗi ngày nên không truy ngược hay
-- nối được giữa các ngày. Không lưu câu hỏi hay câu trả lời ở đây.
-- Chỉ API phía server (service role) đọc/ghi; trình duyệt không truy cập được.

create table if not exists public.ai_usage (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  day         date not null,                     -- ngày theo giờ Việt Nam (UTC+7), dùng để đếm hạn mức
  device_id   uuid not null,
  ip_hash     text check (char_length(ip_hash) <= 64),
  provider    text check (char_length(provider) <= 40)
);

comment on table public.ai_usage is 'Đếm lượt AI miễn phí của Witches Tarot. Không IP thô (chỉ hash xoay vòng theo ngày), không nội dung.';

create index if not exists ai_usage_day_device_idx on public.ai_usage (day, device_id);
create index if not exists ai_usage_day_ip_idx on public.ai_usage (day, ip_hash);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;
