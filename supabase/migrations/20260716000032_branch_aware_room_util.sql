-- 가동률 체인 지점 분리: 반포 시간표(030 적재분)를 대시보드에 연결.
-- vw_sessions → vw_room_slots → vw_room_daily → mv_room_daily 전 단계에 branch를 실어 나르고,
-- dash_* RPC에 p_branch(기본 '대치')를 추가한다. 대치 수치는 기존과 동일해야 한다(회귀 스냅샷 검증).
-- 체인은 의존 역순 drop → 순서대로 재생성 (CASCADE 금지 원칙).

-- 1) drop (의존 역순)
drop materialized view if exists analytics.mv_room_daily;
drop view if exists analytics.vw_room_daily;
drop view if exists analytics.vw_room_slots;
drop view if exists analytics.vw_sessions;

-- 2) vw_sessions: branch 추가. 티켓·강의실 조인도 같은 분원끼리만.
create view analytics.vw_sessions as
with d as (
  select branch, classroom, teacher, time_norm, start_min, end_min, detail, source_date as class_date
  from analytics.timetable
  where classroom is not null and start_min is not null
),
tix as (
  select t.branch, t.class_date,
    regexp_replace(analytics.fix_teacher(t.teacher_name),'T\s*$','') as teacher,
    p.start_min, p.end_min,
    count(*) as student_count,
    count(*) filter (where payment_state in ('결제완료','°áÁ¦¿Ï·á')) as paid_count,
    count(*) filter (where payment_state in ('결제전','°áÁ¦Àü')) as unpaid_count,
    max(t.aca_class_id) as aca_class_id, max(t.class_name) as class_name, max(t.subject_raw) as subject,
    max(t.class_grade) as class_grade, max(t.class_type1) as class_type1, max(t.class_capacity) as capacity
  from public.aca_tickets t
  cross join lateral analytics.parse_time_range(t.schedule_time) p
  where t.class_date <> '2050-01-01' and p.start_min is not null
  group by 1,2,3,4,5
)
select
  d.branch,
  split_part(d.classroom,' ',1) as building,
  d.classroom, d.class_date, extract(isodow from d.class_date)::int as dow,
  coalesce(x.class_name, d.detail) as class_name,
  null::text as schedule_days, d.time_norm as schedule_time,
  d.teacher as teacher_name, x.subject, x.class_grade, x.class_type1, x.capacity,
  coalesce(x.student_count,0) as student_count,
  coalesce(x.paid_count,0) as paid_count, coalesce(x.unpaid_count,0) as unpaid_count,
  d.start_min, d.end_min, (d.end_min - d.start_min) as duration_min, true as time_parse_ok,
  dc.capacity as room_capacity,
  round(coalesce(x.student_count,0)::numeric / nullif(dc.capacity,0),4) as seat_fill_rate,
  coalesce(att.absent,0) as absent_count
from d
left join tix x on x.branch=d.branch and x.class_date=d.class_date and x.teacher=d.teacher
               and x.start_min=d.start_min and x.end_min=d.end_min
left join analytics.dim_classroom dc on dc.branch=d.branch and dc.classroom=d.classroom
left join (select aca_class_id, attended_at, count(*) filter(where status='결석') absent
           from public.aca_attendances group by 1,2) att
  on att.aca_class_id = x.aca_class_id and att.attended_at = d.class_date;

-- 3) vw_room_slots
create view analytics.vw_room_slots as
select distinct s.branch, s.building, s.classroom, s.class_date, s.dow, gs as slot_min
from analytics.vw_sessions s
cross join lateral generate_series(s.start_min, s.end_min - 30, 30) as gs
where s.time_parse_ok;

-- 4) vw_room_daily
create view analytics.vw_room_daily as
with occ as (select branch,building,classroom,class_date,dow,count(*)*30 as occupied_min
  from analytics.vw_room_slots group by 1,2,3,4,5),
sess as (select branch,building,classroom,class_date,dow,
    count(*) as session_count, count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum, sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum, sum(unpaid_count) as unpaid_sum,
    sum(student_count*duration_min) filter (where time_parse_ok) as student_min,
    sum(coalesce(room_capacity,0)*duration_min) filter (where time_parse_ok) as cap_min,
    count(distinct case when start_min<780 then 1 when start_min<1020 then 2 else 3 end)
      filter (where time_parse_ok) as buckets_used,
    sum(student_count) filter (where time_parse_ok and start_min<780) as t_morning,
    sum(student_count) filter (where time_parse_ok and start_min>=780 and start_min<1020) as t_afternoon,
    sum(student_count) filter (where time_parse_ok and start_min>=1020) as t_evening,
    sum(greatest(student_count - absent_count, 0)) as attended_sum
  from analytics.vw_sessions group by 1,2,3,4,5)
select s.branch,s.building,s.classroom,s.class_date,s.dow,
  coalesce(o.occupied_min,0) as occupied_min,(c.close_min-c.open_min) as operating_min,
  round(coalesce(o.occupied_min,0)::numeric/nullif(c.close_min-c.open_min,0),4) as utilization,
  s.session_count,s.parsed_session_count,s.student_sum,s.capacity_sum,
  round(s.student_sum::numeric/nullif(s.capacity_sum,0),4) as fill_rate,
  s.paid_sum,s.unpaid_sum,round(s.unpaid_sum::numeric/nullif(s.student_sum,0),4) as unpaid_rate,
  s.student_min,s.cap_min,s.buckets_used,
  coalesce(s.t_morning,0) t_morning, coalesce(s.t_afternoon,0) t_afternoon, coalesce(s.t_evening,0) t_evening,
  coalesce(s.attended_sum,0) as attended_sum
from sess s left join occ o using (branch,building,classroom,class_date,dow)
left join analytics.config_operating_hours c on c.day_type = case when s.dow in (6,7) then 'weekend' else 'weekday' end;

-- 5) mv_room_daily (pg_cron refresh_mv_room_daily가 15분마다 concurrently 갱신 — 유니크 인덱스 필수)
create materialized view analytics.mv_room_daily as select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk on analytics.mv_room_daily (branch, classroom, class_date);
create index mv_room_daily_date on analytics.mv_room_daily (class_date);
create index mv_room_daily_bld on analytics.mv_room_daily (branch, building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;

-- 6) dash RPC들: p_branch 추가 (기본 '대치' — 기존 호출 하위 호환). 시그니처가 바뀌는
--    함수는 오버로드 모호성(PostgREST 300)을 피하려 옛 시그니처를 명시적으로 drop.

drop function if exists analytics.dash_kpis(date,date,text,text,integer[]);
create function analytics.dash_kpis(p_from date default null, p_to date default null, p_building text default null, p_classroom text default null, p_dow integer[] default null, p_branch text default '대치')
returns table (avg_utilization numeric, total_occupied_hours numeric, total_sessions bigint, avg_fill_rate numeric, unpaid_rate numeric, unparsed_sessions bigint, room_day_count bigint)
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
  where branch = p_branch
    and (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
    and (p_building is null or building=p_building) and (p_classroom is null or classroom=p_classroom)
    and (p_dow is null or dow = any(p_dow));
$$;

drop function if exists analytics.dash_trend(date,date,text,text,integer[],text);
create function analytics.dash_trend(p_from date default null, p_to date default null, p_building text default null, p_classroom text default null, p_dow integer[] default null, p_granularity text default 'day', p_branch text default '대치')
returns table (bucket date, utilization numeric, occupied_min bigint, operating_min bigint)
language sql stable as $$
  select
    case p_granularity when 'month' then date_trunc('month',class_date)::date
      when 'week' then date_trunc('week',class_date)::date else class_date end,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min),0),4),
    sum(occupied_min), sum(operating_min)
  from analytics.mv_room_daily
  where branch = p_branch
    and (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
    and (p_building is null or building=p_building) and (p_classroom is null or classroom=p_classroom)
    and (p_dow is null or dow = any(p_dow))
  group by 1 order by 1;
$$;

drop function if exists analytics.dash_building(date,date,text,integer[]);
create function analytics.dash_building(p_from date default null, p_to date default null, p_classroom text default null, p_dow integer[] default null, p_branch text default '대치')
returns table (building text, utilization numeric, occupied_hours numeric, sessions bigint)
language sql stable as $$
  select
    building,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4),
    round(sum(occupied_min)::numeric / 60, 1),
    sum(session_count)
  from analytics.vw_room_daily
  where branch = p_branch
    and (p_from      is null or class_date >= p_from)
    and (p_to        is null or class_date <= p_to)
    and (p_classroom is null or classroom  = p_classroom)
    and (p_dow       is null or dow = any(p_dow))
  group by building
  order by 2 desc nulls last;
$$;

drop function if exists analytics.dash_room(date,date,text,integer[]);
create function analytics.dash_room(p_from date default null, p_to date default null, p_building text default null, p_dow integer[] default null, p_branch text default '대치')
returns table (building text, classroom text, utilization numeric, utilization_all numeric, occupied_hours numeric, sessions bigint, student_sum bigint, capacity integer, days bigint)
language sql stable as $$
  with cfg as (
    select max(case when day_type='weekday' then close_min-open_min end) wd,
           max(case when day_type='weekend' then close_min-open_min end) we
    from analytics.config_operating_hours
  ),
  opdays as (
    select coalesce(sum(case when d.dow in (6,7) then c.we else c.wd end),0) as total_op_min
    from (select distinct class_date, dow from analytics.mv_room_daily
          where branch = p_branch
            and (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow = any(p_dow))) d
    cross join cfg c
  )
  select rd.building, rd.classroom,
    round(sum(rd.occupied_min)::numeric / nullif(sum(rd.operating_min),0),4),
    round(sum(rd.occupied_min)::numeric / nullif((select total_op_min from opdays),0),4),
    round(sum(rd.occupied_min)::numeric / 60,1),
    sum(rd.session_count), sum(rd.student_sum), max(dc.capacity), count(*)
  from analytics.mv_room_daily rd
  left join analytics.dim_classroom dc on dc.branch=p_branch and dc.classroom=rd.classroom
  where rd.branch = p_branch
    and (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
    and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow = any(p_dow))
  group by rd.building, rd.classroom
  order by 3 desc nulls last;
$$;

drop function if exists analytics.dash_room_session(date,date,text,integer[]);
create function analytics.dash_room_session(p_from date default null, p_to date default null, p_building text default null, p_dow integer[] default null, p_branch text default '대치')
returns table (building text, classroom text, operating_sessions bigint, used_sessions bigint, tickets bigint, capacity integer, m1 numeric, m2 numeric, m3 numeric, exception_sessions bigint, exception_tickets bigint)
language sql stable as $$
  with total_op as (
    select coalesce(sum(analytics.op_sessions(class_date)),0) total
    from (select distinct class_date from analytics.mv_room_daily
          where branch = p_branch
            and (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow=any(p_dow))) d
  ),
  rooms as (
    select rd.building, rd.classroom,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date)
               then (rd.t_morning>0)::int + (rd.t_afternoon>0)::int + (rd.t_evening>0)::int
               else (rd.t_evening>0)::int end) as used,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date)
               then rd.t_morning+rd.t_afternoon+rd.t_evening
               else rd.t_evening end) as tickets,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date) then 0
               else (rd.t_morning>0)::int + (rd.t_afternoon>0)::int end) as exc_sess,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date) then 0
               else rd.t_morning+rd.t_afternoon end) as exc_tix
    from analytics.mv_room_daily rd
    where rd.branch = p_branch
      and (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
      and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow=any(p_dow))
    group by 1,2
  )
  select r.building, r.classroom,
    (select total from total_op)::bigint, r.used::bigint, r.tickets::bigint, dc.capacity,
    round(r.used::numeric/nullif((select total from total_op),0),4),
    round(r.tickets::numeric/nullif(r.used*dc.capacity,0),4),
    round(r.tickets::numeric/nullif((select total from total_op)*dc.capacity,0),4),
    r.exc_sess::bigint, r.exc_tix::bigint
  from rooms r left join analytics.dim_classroom dc on dc.branch=p_branch and dc.classroom=r.classroom
  order by 9 desc nulls last;
$$;

drop function if exists analytics.dash_seat_util(date,date,text,integer[]);
create function analytics.dash_seat_util(p_from date default null, p_to date default null, p_building text default null, p_dow integer[] default null, p_branch text default '대치')
returns table (student_min bigint, m1_denom bigint, m2_denom bigint, m1_util numeric, m2_util numeric)
language sql stable as $$
  with sess as (
    select coalesce(sum(student_min),0) as num, coalesce(sum(cap_min),0) as m2den
    from analytics.mv_room_daily
    where branch = p_branch
      and (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
      and (p_building is null or building=p_building) and (p_dow is null or dow = any(p_dow))
  ),
  cap as (
    select coalesce(sum(capacity),0) as total_cap from analytics.dim_classroom
    where branch=p_branch and capacity is not null and (p_building is null or building=p_building)
  ),
  cfg as (select max(case when day_type='weekday' then close_min-open_min end) wd,
                 max(case when day_type='weekend' then close_min-open_min end) we
          from analytics.config_operating_hours),
  opdays as (
    select coalesce(sum(case when d.dow in (6,7) then c.we else c.wd end),0) as op_min
    from (select distinct class_date, dow from analytics.mv_room_daily
          where branch = p_branch
            and (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow = any(p_dow))) d cross join cfg c
  )
  select s.num::bigint,
    ((select total_cap from cap)*(select op_min from opdays))::bigint, s.m2den::bigint,
    round(s.num::numeric / nullif((select total_cap from cap)*(select op_min from opdays),0),4),
    round(s.num::numeric / nullif(s.m2den,0),4)
  from sess s;
$$;

drop function if exists analytics.dash_filter_options();
create function analytics.dash_filter_options(p_branch text default '대치')
returns table (buildings text[], classrooms jsonb, min_date date, max_date date)
language sql stable as $$
  with rooms as (select distinct building, classroom from analytics.mv_room_daily
                 where branch = p_branch order by building, classroom)
  select
    (select array_agg(distinct building order by building) from rooms),
    (select jsonb_agg(jsonb_build_object('building',building,'classroom',classroom)) from rooms),
    (select min(class_date) from analytics.mv_room_daily where branch = p_branch),
    (select max(class_date) from analytics.mv_room_daily where branch = p_branch);
$$;

drop function if exists analytics.dash_building_trend(date,date);
create function analytics.dash_building_trend(p_from date default null, p_to date default null, p_branch text default '대치')
returns table (building text, month text, util numeric, seat_fill numeric)
language sql stable as $$
  select building,
    to_char(class_date, 'YYYY-MM') as month,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4) as util,
    round(sum(student_min)::numeric / nullif(sum(cap_min), 0), 4) as seat_fill
  from analytics.mv_room_daily
  where branch = p_branch
    and (p_from is null or class_date >= p_from)
    and (p_to is null or class_date <= p_to)
  group by building, to_char(class_date, 'YYYY-MM')
  order by month, building;
$$;

-- dash_building_period(027 정식본): 시그니처 유지, mv 읽는 rd/att CTE에 branch 필터만 추가.
create or replace function analytics.dash_building_period(p_from date default null, p_to date default null, p_building text default null, p_branch text default '대치')
returns table (building text, rooms bigint, capacity bigint, util numeric, seat_fill numeric, attend_rate numeric, booked bigint, sessions bigint, revenue bigint, area_py bigint, rent_monthly bigint, deposit bigint, maintenance bigint, rent_period bigint, rev_per_rent numeric)
language sql stable as $$
  with bld as (
    select distinct building from analytics.dim_lease
    where branch = p_branch and (p_building is null or building = p_building)
  ),
  rd as (
    select building,
      count(distinct classroom) as rooms,
      sum(occupied_min) as occ, sum(operating_min) as opn,
      sum(student_min) as smin, sum(cap_min) as cmin,
      sum(student_sum) as booked, sum(session_count) as sess
    from analytics.mv_room_daily
    where branch = p_branch
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or building = p_building)
    group by building
  ),
  att as (  -- 출석율은 과거만 (미래는 결석 미기록). mv_room_daily 사전계산 사용.
    select building,
      sum(student_sum) as booked_past,
      sum(attended_sum) as attended_past
    from analytics.mv_room_daily
    where branch = p_branch
      and class_date < current_date
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or building = p_building)
    group by building
  ),
  rev as (
    select split_part(classroom, ' ', 1) as building,
      sum(class_amount_per_session)::bigint as revenue
    from public.aca_tickets
    where branch = p_branch and classroom is not null and class_date <> '2050-01-01'
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or split_part(classroom, ' ', 1) = p_building)
    group by 1
  ),
  cap as (
    select building, sum(capacity)::bigint as cap
    from analytics.dim_classroom where branch = p_branch group by building
  ),
  lease as (
    select building,
      sum(area_py)::bigint as area_py, sum(rent_monthly)::bigint as rent_monthly,
      sum(deposit)::bigint as deposit, sum(maintenance)::bigint as maintenance
    from analytics.dim_lease where branch = p_branch group by building
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

grant execute on function
  analytics.dash_kpis(date,date,text,text,integer[],text),
  analytics.dash_trend(date,date,text,text,integer[],text,text),
  analytics.dash_building(date,date,text,integer[],text),
  analytics.dash_room(date,date,text,integer[],text),
  analytics.dash_room_session(date,date,text,integer[],text),
  analytics.dash_seat_util(date,date,text,integer[],text),
  analytics.dash_filter_options(text),
  analytics.dash_building_trend(date,date,text),
  analytics.dash_building_period(date,date,text,text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
