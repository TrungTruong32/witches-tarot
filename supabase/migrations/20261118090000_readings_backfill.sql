-- Cho phép đồng bộ lịch sử cũ trong trình duyệt lên (backfill) mà không bị trùng.
-- client_ts: thời điểm trải bài theo đồng hồ trình duyệt (ms). Cùng device_id + client_ts = cùng một trải bài.
-- source: 'live' (lưu ngay sau khi diễn giải) hoặc 'backfill' (đồng bộ từ lịch sử cũ).
alter table public.readings add column if not exists client_ts bigint;
alter table public.readings add column if not exists source text not null default 'live';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'readings_source_chk') then
    alter table public.readings add constraint readings_source_chk check (source in ('live', 'backfill'));
  end if;
end $$;
-- Ràng buộc duy nhất (không phải index một phần) để PostgREST dùng được on_conflict=device_id,client_ts.
-- NULL không trùng nhau trong Postgres, nên các bản ghi cũ chưa có client_ts vẫn hợp lệ.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'readings_device_client_ts_key') then
    alter table public.readings add constraint readings_device_client_ts_key unique (device_id, client_ts);
  end if;
end $$;
