-- Cho API /api/readings biết database đang chiếm bao nhiêu byte, để ngừng nhận trải bài mới TRƯỚC khi
-- chạm trần gói Supabase (free 500MB → database chuyển sang chỉ-đọc, kéo theo cả AI miễn phí ngừng chạy).
-- Chỉ service role (server) gọi được; trình duyệt / anon không gọi được. Chạy lại an toàn.

create or replace function public.db_size_bytes()
returns bigint
language sql
stable
set search_path = ''
as $$ select pg_database_size(current_database())::bigint $$;

revoke all on function public.db_size_bytes() from public, anon, authenticated;
grant execute on function public.db_size_bytes() to service_role;
