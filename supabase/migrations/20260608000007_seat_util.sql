-- 좌석(정원) 반영 가동률 2종
--  분자(공통) = Σ(학생수 × 수업시간)  [학생-분]
--  M1 전체기준  = 분자 / (전체 강의실 정원 × 전체 운영시간)  ← 빈 방·빈 시간 포함
--  M2 가동기준  = 분자 / (정원 × 실제 수업시간)              ← 수업 중 좌석 충원
create or replace function analytics.dash_seat_util(
  p_from date default null, p_to date default null,
  p_building text default null, p_dow int[] default null)
returns table (
  student_min bigint, m1_denom bigint, m2_denom bigint,
  m1_util numeric, m2_util numeric)
language sql stable as $$
  with sess as (
    select coalesce(sum(s.student_count * s.duration_min),0) as num,
           coalesce(sum(s.room_capacity  * s.duration_min),0) as m2den
    from analytics.vw_sessions s
    where s.time_parse_ok and s.room_capacity is not null
      and (p_from is null or s.class_date >= p_from)
      and (p_to   is null or s.class_date <= p_to)
      and (p_building is null or s.building = p_building)
      and (p_dow is null or s.dow = any(p_dow))
  ),
  cap as (
    select coalesce(sum(capacity),0) as total_cap
    from analytics.dim_classroom
    where branch='대치' and capacity is not null
      and (p_building is null or building = p_building)
  ),
  cfg as (
    select max(case when day_type='weekday' then close_min-open_min end) as wd,
           max(case when day_type='weekend' then close_min-open_min end) as we
    from analytics.config_operating_hours
  ),
  opdays as (
    select coalesce(sum(case when d.dow in (6,7) then c.we else c.wd end),0) as op_min
    from (select distinct class_date, dow from analytics.mv_room_daily
          where (p_from is null or class_date >= p_from)
            and (p_to is null or class_date <= p_to)
            and (p_dow is null or dow = any(p_dow))) d
    cross join cfg c
  )
  select s.num::bigint,
         ((select total_cap from cap) * (select op_min from opdays))::bigint,
         s.m2den::bigint,
         round(s.num::numeric / nullif((select total_cap from cap)*(select op_min from opdays),0),4),
         round(s.num::numeric / nullif(s.m2den,0),4)
  from sess s;
$$;
grant execute on function analytics.dash_seat_util(date,date,text,int[]) to anon, authenticated, service_role;
