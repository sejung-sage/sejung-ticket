-- vw_sessions: classroom이 null인 티켓을 시간표(±14일, 요일+교사+시간)로 채워 집계에 포함.
create or replace view analytics.vw_sessions as
with nullfill as (
  select distinct on (t.id) t.id, tt.classroom
  from public.aca_tickets t
  cross join lateral analytics.parse_time_range(t.schedule_time) pt
  join analytics.timetable tt
    on tt.classroom is not null
   and tt.weekday  = extract(isodow from t.class_date)::int
   and tt.teacher  = regexp_replace(t.teacher_name, 'T\s*$', '')
   and tt.start_min = pt.start_min and tt.end_min = pt.end_min
   and abs(tt.source_date - t.class_date) <= 14
  where t.branch = '대치' and t.classroom is null and t.class_date <> '2050-01-01'
    and t.teacher_name is not null
  order by t.id, abs(tt.source_date - t.class_date)
),
src as (
  select t.*, coalesce(t.classroom, nf.classroom) as classroom_eff
  from public.aca_tickets t
  left join nullfill nf on nf.id = t.id
  where t.branch = '대치' and t.class_date <> '2050-01-01'
),
agg as (
  select
    split_part(classroom_eff, ' ', 1) as building,
    classroom_eff                     as classroom,
    class_date,
    extract(isodow from class_date)::int as dow,
    class_name,
    max(schedule_days) as schedule_days, max(schedule_time) as schedule_time,
    max(teacher_name)  as teacher_name,  max(subject_raw)   as subject,
    max(class_grade)   as class_grade,   max(class_type1)   as class_type1,
    max(class_capacity) as capacity,
    count(*) as student_count,
    count(*) filter (where payment_state in ('결제완료', '°áÁ¦¿Ï·á')) as paid_count,
    count(*) filter (where payment_state in ('결제전',   '°áÁ¦Àü'))   as unpaid_count
  from src
  where classroom_eff is not null
  group by 1, 2, 3, 4, 5
)
select
  a.building, a.classroom, a.class_date, a.dow, a.class_name,
  a.schedule_days, a.schedule_time, a.teacher_name, a.subject, a.class_grade,
  a.class_type1, a.capacity, a.student_count, a.paid_count, a.unpaid_count,
  t.start_min, t.end_min,
  case when t.start_min is not null then t.end_min - t.start_min end as duration_min,
  (t.start_min is not null) as time_parse_ok,
  dc.capacity as room_capacity,
  round(a.student_count::numeric / nullif(dc.capacity, 0), 4) as seat_fill_rate
from agg a
left join lateral analytics.parse_time_range(a.schedule_time) t on true
left join analytics.dim_classroom dc on dc.branch = '대치' and dc.classroom = a.classroom;
