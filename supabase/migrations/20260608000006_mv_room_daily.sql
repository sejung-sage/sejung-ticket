-- =====================================================================
-- 성능: vw_room_daily를 매 쿼리 재계산(4.2s) → materialized view로 사전계산.
-- 집계 RPC들을 mv_room_daily로 연결, pg_cron으로 15분마다 갱신.
-- (그리드 셀은 여전히 vw_sessions=실시간; 집계 KPI/추이/순위는 최대 15분 지연 허용)
-- =====================================================================

create materialized view if not exists analytics.mv_room_daily as
  select * from analytics.vw_room_daily
with data;

-- CONCURRENTLY 갱신에 필요한 유니크 인덱스 + 조회 인덱스
create unique index if not exists mv_room_daily_pk
  on analytics.mv_room_daily (classroom, class_date);
create index if not exists mv_room_daily_date  on analytics.mv_room_daily (class_date);
create index if not exists mv_room_daily_bld   on analytics.mv_room_daily (building);

grant select on analytics.mv_room_daily to anon, authenticated, service_role;

-- ── 집계 RPC들을 mv_room_daily로 재연결 ──────────────────────────────
create or replace function analytics.dash_kpis(
  p_from date default null, p_to date default null,
  p_building text default null, p_classroom text default null, p_dow int[] default null)
returns table (avg_utilization numeric, total_occupied_hours numeric, total_sessions bigint,
  avg_fill_rate numeric, unpaid_rate numeric, unparsed_sessions bigint, room_day_count bigint)
language sql stable as $$
  select
    round(sum(occupied_min)::numeric / nullif(sum(operating_min),0),4),
    round(sum(occupied_min)::numeric / 60,1),
    sum(session_count),
    round(sum(student_sum)::numeric / nullif(sum(capacity_sum),0),4),
    round(sum(unpaid_sum)::numeric / nullif(sum(student_sum),0),4),
    sum(session_count - parsed_session_count),
    count(*)
  from analytics.mv_room_daily
  where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
    and (p_building is null or building=p_building) and (p_classroom is null or classroom=p_classroom)
    and (p_dow is null or dow = any(p_dow));
$$;

create or replace function analytics.dash_trend(
  p_from date default null, p_to date default null, p_building text default null,
  p_classroom text default null, p_dow int[] default null, p_granularity text default 'day')
returns table (bucket date, utilization numeric, occupied_min bigint, operating_min bigint)
language sql stable as $$
  select
    case p_granularity when 'month' then date_trunc('month',class_date)::date
      when 'week' then date_trunc('week',class_date)::date else class_date end,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min),0),4),
    sum(occupied_min), sum(operating_min)
  from analytics.mv_room_daily
  where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
    and (p_building is null or building=p_building) and (p_classroom is null or classroom=p_classroom)
    and (p_dow is null or dow = any(p_dow))
  group by 1 order by 1;
$$;

create or replace function analytics.dash_room(
  p_from date default null, p_to date default null, p_building text default null, p_dow int[] default null)
returns table (building text, classroom text, utilization numeric, occupied_hours numeric,
  sessions bigint, student_sum bigint, capacity int, days bigint)
language sql stable as $$
  select rd.building, rd.classroom,
    round(sum(rd.occupied_min)::numeric / nullif(sum(rd.operating_min),0),4),
    round(sum(rd.occupied_min)::numeric / 60,1),
    sum(rd.session_count), sum(rd.student_sum), max(dc.capacity), count(*)
  from analytics.mv_room_daily rd
  left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=rd.classroom
  where (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
    and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow = any(p_dow))
  group by rd.building, rd.classroom order by 3 desc nulls last;
$$;

create or replace function analytics.dash_filter_options()
returns table (buildings text[], classrooms jsonb, min_date date, max_date date)
language sql stable as $$
  with rooms as (select distinct building, classroom from analytics.mv_room_daily order by building, classroom)
  select
    (select array_agg(distinct building order by building) from rooms),
    (select jsonb_agg(jsonb_build_object('building',building,'classroom',classroom)) from rooms),
    (select min(class_date) from analytics.mv_room_daily),
    (select max(class_date) from analytics.mv_room_daily);
$$;

-- ── pg_cron: 15분마다 동시 갱신 ────────────────────────────────────
select cron.unschedule('refresh_mv_room_daily')
  where exists (select 1 from cron.job where jobname='refresh_mv_room_daily');
select cron.schedule('refresh_mv_room_daily', '*/15 * * * *',
  $$refresh materialized view concurrently analytics.mv_room_daily$$);
