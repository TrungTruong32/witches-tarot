-- Lưu trải bài ẩn danh của người dùng Witches Tarot.
-- KHÔNG lưu thông tin cá nhân: không IP, không email, không tên. device_id là UUID ngẫu nhiên
-- do trình duyệt tự sinh (localStorage), chỉ để biết các trải bài nào đến từ cùng một trình duyệt.
-- Chỉ API phía server (/api/readings, dùng service role key) được ghi; trình duyệt không đọc/ghi trực tiếp.

create table if not exists public.readings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  device_id   uuid not null,
  lang        text check (lang in ('vi', 'en')),
  deck        text check (char_length(deck) <= 200),
  spread      text check (char_length(spread) <= 40),
  question    text check (char_length(question) <= 1000),
  cards       jsonb not null check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 15),
  facts       jsonb check (facts is null or jsonb_typeof(facts) = 'array'),
  ai_answer   text check (char_length(ai_answer) <= 30000),
  model       text check (char_length(model) <= 120),
  app_version text check (char_length(app_version) <= 40)
);

comment on table public.readings is 'Trải bài ẩn danh từ Witches Tarot. Không chứa IP/email/tên; device_id là UUID ngẫu nhiên phía trình duyệt.';

create index if not exists readings_created_at_idx on public.readings (created_at desc);
create index if not exists readings_device_idx on public.readings (device_id, created_at desc);

-- Khoá kín: bật RLS và không tạo policy nào → anon/authenticated không đọc/ghi được.
-- Service role (chỉ có ở server) bỏ qua RLS nên API vẫn ghi được.
alter table public.readings enable row level security;
revoke all on table public.readings from anon, authenticated;
