-- =====================================================================
-- 세정학원 강의실 가동률 — 대시보드 집계 RPC
-- 이유: PostgREST 서버사이드 aggregate 비활성 + max-rows 1000 캡.
--       → 가중집계를 DB 함수로 수행하고 앱엔 작은 결과만 반환.
-- 모두 vw_room_daily 기반, 읽기전용(stable). 필터: 기간/건물/강의실/요일.
-- 가중평균 원칙: Σ분자 / Σ분모 (비율의 단순평균 아님).
-- =====================================================================

-- 1) KPI 묶음 (1행) -----------------------------------------------------
create or replace function analytics.dash_kpis(
  p_from       date   default null,
  p_to         date   default null,
  p_building   text   default null,
  p_classroom  text   default null,
  p_dow        int[]  default null
)
returns table (
  avg_utilization      numeric,   -- Σ점유 / Σ운영 (0~1)
  total_occupied_hours numeric,   -- Σ점유분 / 60
  total_sessions       bigint,
  avg_fill_rate        numeric,   -- Σ학생 / Σ정원
  unpaid_rate          numeric,   -- Σ미납 / Σ학생
  unparsed_sessions    bigint,    -- Σ(세션 - 파싱성공세션) = 가동집계 제외분
  room_day_count       bigint     -- (강의실×날짜) 행수
)
language sql
stable
as $$
  select
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4),
    round(sum(occupied_min)::numeric / 60, 1),
    sum(session_count),
    round(sum(student_sum)::numeric / nullif(sum(capacity_sum), 0), 4),
    round(sum(unpaid_sum)::numeric / nullif(sum(student_sum), 0), 4),
    sum(session_count - parsed_session_count),
    count(*)
  from analytics.vw_room_daily
  where (p_from      is null or class_date >= p_from)
    and (p_to        is null or class_date <= p_to)
    and (p_building  is null or building   = p_building)
    and (p_classroom is null or classroom  = p_classroom)
    and (p_dow       is null or dow = any(p_dow));
$$;

-- 2) 가동률 추이 (일 또는 주 버킷) --------------------------------------
create or replace function analytics.dash_trend(
  p_from        date   default null,
  p_to          date   default null,
  p_building    text   default null,
  p_classroom   text   default null,
  p_dow         int[]  default null,
  p_granularity text   default 'day'   -- 'day' | 'week'
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
    case when p_granularity = 'week'
         then date_trunc('week', class_date)::date
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

-- 3) 건물(관)별 가동률 --------------------------------------------------
create or replace function analytics.dash_building(
  p_from       date   default null,
  p_to         date   default null,
  p_classroom  text   default null,
  p_dow        int[]  default null
)
returns table (
  building       text,
  utilization    numeric,
  occupied_hours numeric,
  sessions       bigint
)
language sql
stable
as $$
  select
    building,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4),
    round(sum(occupied_min)::numeric / 60, 1),
    sum(session_count)
  from analytics.vw_room_daily
  where (p_from      is null or class_date >= p_from)
    and (p_to        is null or class_date <= p_to)
    and (p_classroom is null or classroom  = p_classroom)
    and (p_dow       is null or dow = any(p_dow))
  group by building
  order by 2 desc nulls last;
$$;

-- 4) 필터 옵션 (건물/강의실 목록 + 데이터 가용 기간) -------------------
create or replace function analytics.dash_filter_options()
returns table (
  buildings  text[],
  classrooms jsonb,    -- [{ "building": ..., "classroom": ... }] (building, classroom 정렬)
  min_date   date,
  max_date   date
)
language sql
stable
as $$
  with rooms as (
    select distinct building, classroom
    from analytics.vw_room_daily
    order by building, classroom
  )
  select
    (select array_agg(distinct building order by building) from rooms),
    (select jsonb_agg(jsonb_build_object('building', building, 'classroom', classroom)) from rooms),
    (select min(class_date) from analytics.vw_room_daily),
    (select max(class_date) from analytics.vw_room_daily);
$$;

-- 권한 ----------------------------------------------------------------
grant execute on function analytics.dash_kpis(date,date,text,text,int[])           to anon, authenticated, service_role;
grant execute on function analytics.dash_trend(date,date,text,text,int[],text)      to anon, authenticated, service_role;
grant execute on function analytics.dash_building(date,date,text,int[])             to anon, authenticated, service_role;
grant execute on function analytics.dash_filter_options()                           to anon, authenticated, service_role;
