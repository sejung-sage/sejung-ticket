-- 성능: dash_seat_util도 MV에서 읽도록, vw_room_daily에 student_min/cap_min 추가 후 MV 재생성.
-- (그리드 getDaySessions만 실시간 vw_sessions 사용 → 요청당 무거운 뷰 조회 1회로 축소)

-- 1) vw_room_daily에 학생-분/좌석-분 컬럼 추가 (끝에 append)
create or replace view analytics.vw_room_daily as
with occ as (
  select building, classroom, class_date, dow, count(*) * 30 as occupied_min
  from analytics.vw_room_slots group by 1,2,3,4
),
sess as (
  select building, classroom, class_date, dow,
    count(*) as session_count,
    count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum,
    sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum,
    sum(unpaid_count) as unpaid_sum,
    sum(student_count * duration_min) filter (where time_parse_ok)            as student_min,
    sum(coalesce(room_capacity,0) * duration_min) filter (where time_parse_ok) as cap_min
  from analytics.vw_sessions group by 1,2,3,4
)
select
  s.building, s.classroom, s.class_date, s.dow,
  coalesce(o.occupied_min,0) as occupied_min,
  (c.close_min - c.open_min) as operating_min,
  round(coalesce(o.occupied_min,0)::numeric / nullif(c.close_min - c.open_min,0),4) as utilization,
  s.session_count, s.parsed_session_count, s.student_sum, s.capacity_sum,
  round(s.student_sum::numeric / nullif(s.capacity_sum,0),4) as fill_rate,
  s.paid_sum, s.unpaid_sum,
  round(s.unpaid_sum::numeric / nullif(s.student_sum,0),4) as unpaid_rate,
  s.student_min, s.cap_min
from sess s
left join occ o using (building, classroom, class_date, dow)
left join analytics.config_operating_hours c
  on c.day_type = case when s.dow in (6,7) then 'weekend' else 'weekday' end;

-- 2) MV 재생성 (컬럼 추가됐으므로 drop & recreate)
begin;
drop materialized view if exists analytics.mv_room_daily cascade;
create materialized view analytics.mv_room_daily as select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk   on analytics.mv_room_daily (classroom, class_date);
create index        mv_room_daily_date on analytics.mv_room_daily (class_date);
create index        mv_room_daily_bld  on analytics.mv_room_daily (building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;
commit;

-- 3) dash_seat_util → MV 기반(실시간 vw_sessions 제거)
create or replace function analytics.dash_seat_util(
  p_from date default null, p_to date default null,
  p_building text default null, p_dow int[] default null)
returns table (student_min bigint, m1_denom bigint, m2_denom bigint, m1_util numeric, m2_util numeric)
language sql stable as $$
  with sess as (
    select coalesce(sum(student_min),0) as num, coalesce(sum(cap_min),0) as m2den
    from analytics.mv_room_daily
    where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
      and (p_building is null or building=p_building) and (p_dow is null or dow = any(p_dow))
  ),
  cap as (
    select coalesce(sum(capacity),0) as total_cap from analytics.dim_classroom
    where branch='대치' and capacity is not null and (p_building is null or building=p_building)
  ),
  cfg as (select max(case when day_type='weekday' then close_min-open_min end) wd,
                 max(case when day_type='weekend' then close_min-open_min end) we
          from analytics.config_operating_hours),
  opdays as (
    select coalesce(sum(case when d.dow in (6,7) then c.we else c.wd end),0) as op_min
    from (select distinct class_date, dow from analytics.mv_room_daily
          where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow = any(p_dow))) d cross join cfg c
  )
  select s.num::bigint,
    ((select total_cap from cap)*(select op_min from opdays))::bigint, s.m2den::bigint,
    round(s.num::numeric / nullif((select total_cap from cap)*(select op_min from opdays),0),4),
    round(s.num::numeric / nullif(s.m2den,0),4)
  from sess s;
$$;
grant execute on function analytics.dash_seat_util(date,date,text,int[]) to anon, authenticated, service_role;
