-- 보강 예외: 평일 비저녁(아침/오후) 세션을 정규 가동률에서 제외하고 별도 카운트.
-- vw_room_daily에 버킷별 티켓수 추가 → mv 재생성 → RPC 보강 분리.

create or replace view analytics.vw_room_daily as
with occ as (select building,classroom,class_date,dow,count(*)*30 as occupied_min
  from analytics.vw_room_slots group by 1,2,3,4),
sess as (select building,classroom,class_date,dow,
    count(*) as session_count, count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum, sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum, sum(unpaid_count) as unpaid_sum,
    sum(student_count*duration_min) filter (where time_parse_ok) as student_min,
    sum(coalesce(room_capacity,0)*duration_min) filter (where time_parse_ok) as cap_min,
    count(distinct case when start_min<780 then 1 when start_min<1020 then 2 else 3 end)
      filter (where time_parse_ok) as buckets_used,
    sum(student_count) filter (where time_parse_ok and start_min<780) as t_morning,
    sum(student_count) filter (where time_parse_ok and start_min>=780 and start_min<1020) as t_afternoon,
    sum(student_count) filter (where time_parse_ok and start_min>=1020) as t_evening
  from analytics.vw_sessions group by 1,2,3,4)
select s.building,s.classroom,s.class_date,s.dow,
  coalesce(o.occupied_min,0) as occupied_min,(c.close_min-c.open_min) as operating_min,
  round(coalesce(o.occupied_min,0)::numeric/nullif(c.close_min-c.open_min,0),4) as utilization,
  s.session_count,s.parsed_session_count,s.student_sum,s.capacity_sum,
  round(s.student_sum::numeric/nullif(s.capacity_sum,0),4) as fill_rate,
  s.paid_sum,s.unpaid_sum,round(s.unpaid_sum::numeric/nullif(s.student_sum,0),4) as unpaid_rate,
  s.student_min,s.cap_min,s.buckets_used,
  coalesce(s.t_morning,0) as t_morning, coalesce(s.t_afternoon,0) as t_afternoon, coalesce(s.t_evening,0) as t_evening
from sess s left join occ o using (building,classroom,class_date,dow)
left join analytics.config_operating_hours c on c.day_type = case when s.dow in (6,7) then 'weekend' else 'weekday' end;

drop materialized view if exists analytics.mv_room_daily;
create materialized view analytics.mv_room_daily as select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk on analytics.mv_room_daily (classroom, class_date);
create index mv_room_daily_date on analytics.mv_room_daily (class_date);
create index mv_room_daily_bld on analytics.mv_room_daily (building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;

-- RPC: 평일 정규=저녁만, 평일 비저녁=보강(예외, 제외). 주말=3세션 모두 정규.
drop function if exists analytics.dash_room_session(date,date,text,int[]);
create function analytics.dash_room_session(
  p_from date default null, p_to date default null, p_building text default null, p_dow int[] default null)
returns table (building text, classroom text, operating_sessions bigint, used_sessions bigint,
  tickets bigint, capacity int, m1 numeric, m2 numeric, m3 numeric,
  exception_sessions bigint, exception_tickets bigint)
language sql stable as $$
  with cfg as (select max(case when day_type='weekday' then sessions end) wd,
                      max(case when day_type='weekend' then sessions end) we
               from analytics.config_operating_sessions),
  total_op as (
    select coalesce(sum(case when dow in (6,7) then (select we from cfg) else (select wd from cfg) end),0) total
    from (select distinct class_date, dow from analytics.mv_room_daily
          where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow=any(p_dow))) d
  ),
  rooms as (
    select rd.building, rd.classroom,
      sum(case when rd.dow in (6,7)
               then (rd.t_morning>0)::int + (rd.t_afternoon>0)::int + (rd.t_evening>0)::int
               else (rd.t_evening>0)::int end) as used,
      sum(case when rd.dow in (6,7) then rd.t_morning+rd.t_afternoon+rd.t_evening
               else rd.t_evening end) as tickets,
      sum(case when rd.dow in (6,7) then 0
               else (rd.t_morning>0)::int + (rd.t_afternoon>0)::int end) as exc_sess,
      sum(case when rd.dow in (6,7) then 0 else rd.t_morning+rd.t_afternoon end) as exc_tix
    from analytics.mv_room_daily rd
    where (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
      and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow=any(p_dow))
    group by 1,2
  )
  select r.building, r.classroom,
    (select total from total_op)::bigint, r.used::bigint, r.tickets::bigint, dc.capacity,
    round(r.used::numeric/nullif((select total from total_op),0),4),
    round(r.tickets::numeric/nullif(r.used*dc.capacity,0),4),
    round(r.tickets::numeric/nullif((select total from total_op)*dc.capacity,0),4),
    r.exc_sess::bigint, r.exc_tix::bigint
  from rooms r left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=r.classroom
  order by 9 desc nulls last;
$$;
grant execute on function analytics.dash_room_session(date,date,text,int[]) to anon, authenticated, service_role;
