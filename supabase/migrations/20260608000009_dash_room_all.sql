-- 강의실별 가동률에 "전체기준" 컬럼 추가 (반환 형태 변경 → drop 후 재생성)
--   utilization      = Σ점유 / Σ운영(가동된 날만)          ← 기존
--   utilization_all  = Σ점유 / (기간 전체 운영일 × 운영시간)  ← 신규(빈 날 포함)
drop function if exists analytics.dash_room(date,date,text,int[]);
create function analytics.dash_room(
  p_from date default null, p_to date default null, p_building text default null, p_dow int[] default null)
returns table (
  building text, classroom text,
  utilization numeric, utilization_all numeric,
  occupied_hours numeric, sessions bigint, student_sum bigint, capacity int, days bigint)
language sql stable as $$
  with cfg as (
    select max(case when day_type='weekday' then close_min-open_min end) wd,
           max(case when day_type='weekend' then close_min-open_min end) we
    from analytics.config_operating_hours
  ),
  opdays as (
    select coalesce(sum(case when d.dow in (6,7) then c.we else c.wd end),0) as total_op_min
    from (select distinct class_date, dow from analytics.mv_room_daily
          where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow = any(p_dow))) d
    cross join cfg c
  )
  select rd.building, rd.classroom,
    round(sum(rd.occupied_min)::numeric / nullif(sum(rd.operating_min),0),4),
    round(sum(rd.occupied_min)::numeric / nullif((select total_op_min from opdays),0),4),
    round(sum(rd.occupied_min)::numeric / 60,1),
    sum(rd.session_count), sum(rd.student_sum), max(dc.capacity), count(*)
  from analytics.mv_room_daily rd
  left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=rd.classroom
  where (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
    and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow = any(p_dow))
  group by rd.building, rd.classroom
  order by 3 desc nulls last;
$$;
grant execute on function analytics.dash_room(date,date,text,int[]) to anon, authenticated, service_role;
