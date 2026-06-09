-- 업로드 현황 그리드용 집계 RPC.
-- 기존엔 timetable 전 행을 select 후 클라이언트 집계했으나, 행수가 1000(PostgREST 캡)을
-- 넘어가면서 최근 재적재분(예: 5/25,5/26)이 잘려 ○로 표시되는 버그 발생.
-- 집계를 서버에서 수행해 캡과 무관하게 날짜당 1행만 반환.
create or replace function analytics.dash_timetable_status()
returns table (source_date date, weekday int, cells bigint, rooms bigint)
language sql stable as $$
  select source_date, max(weekday) as weekday,
         count(*) as cells,
         count(*) filter (where classroom is not null) as rooms
  from analytics.timetable
  group by source_date
  order by source_date desc
$$;

grant execute on function analytics.dash_timetable_status() to anon, authenticated, service_role;
