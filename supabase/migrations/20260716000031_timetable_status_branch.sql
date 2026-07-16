-- 업로드 현황 RPC 지점 분리: timetable.branch 도입(030) 후에도 날짜별 합산이라
-- 대치+반포가 섞여 보이던 것을, 분원 파라미터로 해당 분원 행만 집계.
drop function if exists analytics.dash_timetable_status();
create or replace function analytics.dash_timetable_status(p_branch text default '대치')
returns table (source_date date, weekday int, cells bigint, rooms bigint)
language sql stable as $$
  select source_date, max(weekday) as weekday,
         count(*) as cells,
         count(*) filter (where classroom is not null) as rooms
  from analytics.timetable
  where branch = p_branch
  group by source_date
  order by source_date desc
$$;

grant execute on function analytics.dash_timetable_status(text) to anon, authenticated, service_role;
