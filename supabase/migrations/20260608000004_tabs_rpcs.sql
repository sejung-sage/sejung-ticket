-- =====================================================================
-- 사이드바 탭용 추가 객체
--  1) dash_trend: 'month' 단위 지원 추가
--  2) dash_room : 강의실별 가동률(기간 집계)
--  3) dim_classroom 쓰기 권한(정원 수정 탭)
--  4) class_room_assignment: 강좌→강의실 수동 배정 테이블
-- =====================================================================

-- 1) dash_trend — day/week/month -------------------------------------
create or replace function analytics.dash_trend(
  p_from        date   default null,
  p_to          date   default null,
  p_building    text   default null,
  p_classroom   text   default null,
  p_dow         int[]  default null,
  p_granularity text   default 'day'   -- 'day' | 'week' | 'month'
)
returns table (
  bucket        date,
  utilization   numeric,
  occupied_min  bigint,
  operating_min bigint
)
language sql
stable
as $$
  select
    case p_granularity
      when 'month' then date_trunc('month', class_date)::date
      when 'week'  then date_trunc('week',  class_date)::date
      else class_date end as bucket,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4),
    sum(occupied_min),
    sum(operating_min)
  from analytics.vw_room_daily
  where (p_from      is null or class_date >= p_from)
    and (p_to        is null or class_date <= p_to)
    and (p_building  is null or building   = p_building)
    and (p_classroom is null or classroom  = p_classroom)
    and (p_dow       is null or dow = any(p_dow))
  group by 1
  order by 1;
$$;

-- 2) dash_room — 강의실별 가동률(기간) ------------------------------
create or replace function analytics.dash_room(
  p_from     date  default null,
  p_to       date  default null,
  p_building text  default null,
  p_dow      int[] default null
)
returns table (
  building       text,
  classroom      text,
  utilization    numeric,   -- 가동률(점유/운영)
  occupied_hours numeric,
  sessions       bigint,
  student_sum    bigint,
  capacity       int,       -- 물리 정원(dim_classroom)
  days           bigint     -- 집계된 운영일수
)
language sql
stable
as $$
  select
    rd.building,
    rd.classroom,
    round(sum(rd.occupied_min)::numeric / nullif(sum(rd.operating_min), 0), 4),
    round(sum(rd.occupied_min)::numeric / 60, 1),
    sum(rd.session_count),
    sum(rd.student_sum),
    max(dc.capacity),
    count(*)
  from analytics.vw_room_daily rd
  left join analytics.dim_classroom dc
    on dc.branch = '대치' and dc.classroom = rd.classroom
  where (p_from     is null or rd.class_date >= p_from)
    and (p_to       is null or rd.class_date <= p_to)
    and (p_building is null or rd.building   = p_building)
    and (p_dow      is null or rd.dow = any(p_dow))
  group by rd.building, rd.classroom
  order by 3 desc nulls last;
$$;

-- 3) 정원 수정 탭용 쓰기 권한 (서버는 service_role 사용) --------------
grant insert, update, delete on analytics.dim_classroom to service_role;
grant execute on function analytics.dash_room(date,date,text,int[]) to anon, authenticated, service_role;

-- 4) 강좌 → 강의실 수동 배정 테이블 ---------------------------------
--    원천 aca_tickets엔 (강좌, 강의실)이 항상 엮여 있진 않으므로 수기 보정용.
create table if not exists analytics.class_room_assignment (
  class_name text primary key,
  classroom  text,                              -- dim_classroom.classroom 매칭
  note       text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on analytics.class_room_assignment to service_role;
grant select on analytics.class_room_assignment to anon, authenticated;
