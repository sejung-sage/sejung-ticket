-- =====================================================================
-- 성능: dash_building_period 의 출석율(att) 집계가 timetable 기반 vw_sessions를
-- 매 호출 재계산(~8.7s) → Vercel 서버리스 10초 타임아웃에 걸려 /buildings RSC
-- 내비게이션이 실패(재시도 루프)함. 출석 집계를 mv_room_daily(사전계산·64ms)로 이전.
--  · vw_room_daily 에 attended_sum = Σ greatest(student_count−absent_count,0) 추가
--    (세션 단위로 greatest 적용 후 합산 → 기존 vw_sessions 직접 집계와 수치 동일)
--  · mv_room_daily 재생성(컬럼 추가 반영) + 인덱스/권한 복구
--  · dash_building_period 의 att 를 mv_room_daily 에서 계산
-- mv_room_daily 는 의존 뷰 없음(드롭 안전), pg_cron refresh 잡은 이름 참조라 무관.
-- =====================================================================

-- 1) mv 먼저 드롭(뷰 교체가 mv 의존성에 막히지 않도록)
drop materialized view if exists analytics.mv_room_daily;

-- 2) vw_room_daily 재정의: attended_sum 컬럼만 끝에 추가
create or replace view analytics.vw_room_daily as
with occ as (
  select building, classroom, class_date, dow, count(*) * 30 as occupied_min
  from analytics.vw_room_slots
  group by building, classroom, class_date, dow
), sess as (
  select building, classroom, class_date, dow,
    count(*) as session_count,
    count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum,
    sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum,
    sum(unpaid_count) as unpaid_sum,
    sum(student_count * duration_min) filter (where time_parse_ok) as student_min,
    sum(coalesce(room_capacity, 0) * duration_min) filter (where time_parse_ok) as cap_min,
    count(distinct case when start_min < 780 then 1 when start_min < 1020 then 2 else 3 end)
      filter (where time_parse_ok) as buckets_used,
    sum(student_count) filter (where time_parse_ok and start_min < 780) as t_morning,
    sum(student_count) filter (where time_parse_ok and start_min >= 780 and start_min < 1020) as t_afternoon,
    sum(student_count) filter (where time_parse_ok and start_min >= 1020) as t_evening,
    sum(greatest(student_count - absent_count, 0)) as attended_sum
  from analytics.vw_sessions
  group by building, classroom, class_date, dow
)
select s.building, s.classroom, s.class_date, s.dow,
  coalesce(o.occupied_min, 0) as occupied_min,
  c.close_min - c.open_min as operating_min,
  round(coalesce(o.occupied_min, 0)::numeric / nullif(c.close_min - c.open_min, 0)::numeric, 4) as utilization,
  s.session_count,
  s.parsed_session_count,
  s.student_sum,
  s.capacity_sum,
  round(s.student_sum / nullif(s.capacity_sum, 0)::numeric, 4) as fill_rate,
  s.paid_sum,
  s.unpaid_sum,
  round(s.unpaid_sum / nullif(s.student_sum, 0::numeric), 4) as unpaid_rate,
  s.student_min,
  s.cap_min,
  s.buckets_used,
  coalesce(s.t_morning, 0::numeric) as t_morning,
  coalesce(s.t_afternoon, 0::numeric) as t_afternoon,
  coalesce(s.t_evening, 0::numeric) as t_evening,
  coalesce(s.attended_sum, 0) as attended_sum
from sess s
  left join occ o using (building, classroom, class_date, dow)
  left join analytics.config_operating_hours c
    on c.day_type = case when s.dow = any (array[6, 7]) then 'weekend' else 'weekday' end;

-- 3) mv 재생성 + 인덱스/권한
create materialized view analytics.mv_room_daily as
  select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk on analytics.mv_room_daily (classroom, class_date);
create index mv_room_daily_date on analytics.mv_room_daily (class_date);
create index mv_room_daily_bld  on analytics.mv_room_daily (building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;

-- 4) dash_building_period: att 를 mv_room_daily 에서 (vw_sessions 의존 제거)
drop function if exists analytics.dash_building_period(date, date, text);
create function analytics.dash_building_period(
  p_from date default null, p_to date default null, p_building text default null
)
returns table (
  building text, rooms bigint, capacity bigint,
  util numeric, seat_fill numeric, attend_rate numeric,
  booked bigint, sessions bigint,
  revenue bigint, area_py bigint, rent_monthly bigint,
  deposit bigint, maintenance bigint, rent_period bigint, rev_per_rent numeric
) language sql stable as $$
  with bld as (
    select distinct building from analytics.dim_lease
    where branch = '대치' and (p_building is null or building = p_building)
  ),
  rd as (
    select building,
      count(distinct classroom) as rooms,
      sum(occupied_min) as occ, sum(operating_min) as opn,
      sum(student_min) as smin, sum(cap_min) as cmin,
      sum(student_sum) as booked, sum(session_count) as sess
    from analytics.mv_room_daily
    where (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or building = p_building)
    group by building
  ),
  att as (  -- 출석율은 과거만 (미래는 결석 미기록). mv_room_daily 사전계산 사용.
    select building,
      sum(student_sum) as booked_past,
      sum(attended_sum) as attended_past
    from analytics.mv_room_daily
    where class_date < current_date
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or building = p_building)
    group by building
  ),
  rev as (
    select split_part(classroom, ' ', 1) as building,
      sum(class_amount_per_session)::bigint as revenue
    from public.aca_tickets
    where branch = '대치' and classroom is not null and class_date <> '2050-01-01'
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or split_part(classroom, ' ', 1) = p_building)
    group by 1
  ),
  cap as (
    select building, sum(capacity)::bigint as cap
    from analytics.dim_classroom where branch = '대치' group by building
  ),
  lease as (
    select building,
      sum(area_py)::bigint as area_py, sum(rent_monthly)::bigint as rent_monthly,
      sum(deposit)::bigint as deposit, sum(maintenance)::bigint as maintenance
    from analytics.dim_lease where branch = '대치' group by building
  ),
  prd as (  -- 기간 개월수(둘 다 지정됐을 때만; from~to는 1일~말일 정렬이라 정수 개월)
    select case when p_from is not null and p_to is not null
      then ((date_part('year', p_to) * 12 + date_part('month', p_to))
         - (date_part('year', p_from) * 12 + date_part('month', p_from)) + 1)::int
      end as months
  )
  select bld.building, rd.rooms, cap.cap,
    round(rd.occ::numeric / nullif(rd.opn, 0), 4) as util,
    round(rd.smin::numeric / nullif(rd.cmin, 0), 4) as seat_fill,
    round(att.attended_past::numeric / nullif(att.booked_past, 0), 4) as attend_rate,
    coalesce(rd.booked, 0)::bigint as booked,
    coalesce(rd.sess, 0)::bigint as sessions,
    rev.revenue,
    lease.area_py, lease.rent_monthly, lease.deposit, lease.maintenance,
    (lease.rent_monthly * (select months from prd))::bigint as rent_period,
    round(rev.revenue::numeric
          / nullif(lease.rent_monthly * (select months from prd), 0), 2) as rev_per_rent
  from bld
  left join rd    on rd.building    = bld.building
  left join att   on att.building   = bld.building
  left join rev   on rev.building   = bld.building
  left join cap   on cap.building   = bld.building
  left join lease on lease.building = bld.building
  order by rev_per_rent desc nulls last
$$;

grant execute on function analytics.dash_building_period(date, date, text)
  to anon, authenticated, service_role;
