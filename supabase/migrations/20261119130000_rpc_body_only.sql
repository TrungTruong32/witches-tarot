-- API chỉ gửi dữ liệu trong BODY (JSON) — không ghép giá trị vào query string của PostgREST nữa.
-- Mọi truy cập bảng readings / ai_usage từ server đi qua các hàm dưới đây (POST /rest/v1/rpc/<tên>, body = tham số).
-- Chống SQL injection: tham số có KIỂU (uuid, date, int, text…) và chỉ dùng như giá trị trong câu SQL tĩnh —
-- không có EXECUTE / SQL động ở bất kỳ hàm nào. search_path = '' + tên bảng đầy đủ → không bị đánh tráo đối tượng.
-- Chỉ service role (server) gọi được; anon / authenticated (trình duyệt) không có quyền EXECUTE. Chạy lại an toàn.

-- ===================== AI miễn phí: hạn mức theo ngày =====================

-- Ghi 1 lượt rồi đếm (kể cả lượt vừa ghi) trong CÙNG một giao dịch. Khoá advisory theo ngày xếp hàng các lượt
-- đồng thời → nhiều request bắn song song không lọt quá hạn mức (thay cho 1 INSERT + 3 lần đếm qua query string).
create or replace function public.ai_usage_claim(p_day date, p_device uuid, p_ip_hash text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id bigint;
  v_device int; v_ip int; v_global int;
begin
  if p_day is null or p_device is null then raise exception 'bad params'; end if;
  if p_ip_hash is not null and char_length(p_ip_hash) > 64 then raise exception 'bad ip_hash'; end if;
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || p_day::text));
  insert into public.ai_usage (day, device_id, ip_hash) values (p_day, p_device, p_ip_hash) returning id into v_id;
  select count(*) into v_device from public.ai_usage where day = p_day and device_id = p_device and id <= v_id;
  select count(*) into v_ip     from public.ai_usage where day = p_day and ip_hash = p_ip_hash and id <= v_id;
  select count(*) into v_global from public.ai_usage where day = p_day and id <= v_id;
  return jsonb_build_object('id', v_id, 'device', v_device, 'ip', v_ip, 'global', v_global);
end $$;

-- Huỷ lượt vừa ghi (vượt hạn mức hoặc mọi provider đều lỗi → không tính)
create or replace function public.ai_usage_release(p_id bigint)
returns void
language sql
volatile
set search_path = ''
as $$ delete from public.ai_usage where id = p_id $$;

-- Ghi provider đã trả lời (chỉ để thống kê)
create or replace function public.ai_usage_set_provider(p_id bigint, p_provider text)
returns void
language sql
volatile
set search_path = ''
as $$ update public.ai_usage set provider = left(p_provider, 40) where id = p_id $$;

-- ===================== Lưu trải bài =====================

-- Các con số /api/readings cần để chặn spam / làm đầy DB, lấy trong MỘT lần gọi
create or replace function public.readings_counts(p_device uuid, p_rate_minutes int)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'size_bytes',      pg_database_size(current_database())::bigint,
    'device_recent',   (select count(*) from public.readings where device_id = p_device and source = 'live'
                          and created_at >= now() - make_interval(mins => greatest(1, least(coalesce(p_rate_minutes, 10), 1440)))),
    'live_24h',        (select count(*) from public.readings where source = 'live' and created_at >= now() - interval '1 day'),
    'device_backfill', (select count(*) from public.readings where device_id = p_device and source = 'backfill'),
    'total_backfill',  (select count(*) from public.readings where source = 'backfill')
  )
$$;

-- Ghi 1..25 trải bài đã được server làm sạch. Trùng (device_id, client_ts) thì bỏ qua. Trả về số bản ghi thực ghi.
-- Ràng buộc độ dài / kiểu đã có ở bảng (check constraints); ở đây chỉ ánh xạ JSON → cột có kiểu.
create or replace function public.readings_insert(p_rows jsonb)
returns int
language plpgsql
volatile
set search_path = ''
as $$
declare v_n int;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 25 then
    raise exception 'bad rows';
  end if;
  insert into public.readings (device_id, client_ts, source, lang, deck, spread, question, cards, facts, ai_answer, model, app_version, created_at)
  select x.device_id, x.client_ts, coalesce(x.source, 'live'), x.lang, x.deck, x.spread, x.question, x.cards, x.facts, x.ai_answer, x.model, x.app_version,
         coalesce(x.created_at, now())
  from jsonb_to_recordset(p_rows) as x(device_id uuid, client_ts bigint, source text, lang text, deck text, spread text, question text,
                                        cards jsonb, facts jsonb, ai_answer text, model text, app_version text, created_at timestamptz)
  on conflict (device_id, client_ts) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ===================== Trang xem lịch sử chạy ở máy (local/serve.mjs) =====================

-- Lọc + phân trang. Từ khoá tìm kiếm là THAM SỐ (ILIKE ... ESCAPE), ký tự % _ \ được thoát → không thành wildcard.
create or replace function public.readings_list(
  p_q text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_device uuid default null, p_lang text default null, p_spread text default null, p_source text default null,
  p_card text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with v as (
    select '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  ), f as (
    select r.* from public.readings r cross join v
    where (p_q is null or p_q = '' or r.question ilike v.pat escape '\' or r.ai_answer ilike v.pat escape '\')
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
      and (p_device is null or r.device_id = p_device)
      and (p_lang is null or r.lang = p_lang)
      and (p_spread is null or r.spread = p_spread)
      and (p_source is null or r.source = p_source)
      and (p_card is null or r.cards @> jsonb_build_array(jsonb_build_object('name', p_card)))
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from (
               select * from f order by created_at desc
               limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) p), '[]'::jsonb)
  )
$$;

-- Số liệu tổng quan + mẫu tối đa 5000 bản ghi gần nhất (chỉ các cột cần cho thống kê)
create or replace function public.readings_stats(p_today timestamptz, p_week timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'all',   (select count(*) from public.readings),
    'today', (select count(*) from public.readings where created_at >= p_today),
    'week',  (select count(*) from public.readings where created_at >= p_week),
    'sample', coalesce((select jsonb_agg(s) from (
                select created_at, device_id, lang, spread, cards from public.readings order by created_at desc limit 5000) s), '[]'::jsonb)
  )
$$;

-- ===================== Quyền =====================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ai_usage_claim(date, uuid, text)',
    'public.ai_usage_release(bigint)',
    'public.ai_usage_set_provider(bigint, text)',
    'public.readings_counts(uuid, int)',
    'public.readings_insert(jsonb)',
    'public.readings_list(text, timestamptz, timestamptz, uuid, text, text, text, text, int, int)',
    'public.readings_stats(timestamptz, timestamptz)'
  ] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
end $$;
