-- 032 후속 성능 수정. 032에서 vw_sessions.tix가 전 분원 티켓(~50만행)을 집계하게 되어
-- 라이브 뷰 직독(dash_building)이 statement timeout.
-- ① tix를 시간표에 존재하는 분원(대치·반포)으로 제한 — 조인상 결과 불변, 스캔만 축소.
-- ② dash_building을 다른 dash_*처럼 mv_room_daily로 전환 (최대 15분 지연은 기존 RPC와 동일).

-- ① 컬럼 불변 → create or replace 가능 (체인 drop 불필요)
create or replace view analytics.vw_sessions as
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
    and t.branch in (select distinct branch from analytics.timetable)
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

-- ② dash_building → mv_room_daily
create or replace function analytics.dash_building(p_from date default null, p_to date default null, p_classroom text default null, p_dow integer[] default null, p_branch text default '대치')
returns table (building text, utilization numeric, occupied_hours numeric, sessions bigint)
language sql stable as $$
  select
    building,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4),
    round(sum(occupied_min)::numeric / 60, 1),
    sum(session_count)
  from analytics.mv_room_daily
  where branch = p_branch
    and (p_from      is null or class_date >= p_from)
    and (p_to        is null or class_date <= p_to)
    and (p_classroom is null or classroom  = p_classroom)
    and (p_dow       is null or dow = any(p_dow))
  group by building
  order by 2 desc nulls last;
$$;
