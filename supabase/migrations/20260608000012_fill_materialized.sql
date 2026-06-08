-- 성능: 시간표 채움(null→강의실)을 mv_ticket_fill로 사전계산. vw_sessions는 id로 빠른 조인만.
create materialized view if not exists analytics.mv_ticket_fill as
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
with data;
create unique index if not exists mv_ticket_fill_pk on analytics.mv_ticket_fill (id);
grant select on analytics.mv_ticket_fill to anon, authenticated, service_role;

-- vw_sessions: inline 계산 대신 mv_ticket_fill 조인
create or replace view analytics.vw_sessions as
with src as (
  select t.*, coalesce(t.classroom, nf.classroom) as classroom_eff
  from public.aca_tickets t
  left join analytics.mv_ticket_fill nf on nf.id = t.id
  where t.branch = '대치' and t.class_date <> '2050-01-01'
),
agg as (
  select
    split_part(classroom_eff, ' ', 1) as building,
    classroom_eff                     as classroom,
    class_date, extract(isodow from class_date)::int as dow, class_name,
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

-- 채움 MV도 15분마다 갱신
select cron.schedule('refresh_mv_ticket_fill', '*/15 * * * *',
  $$refresh materialized view concurrently analytics.mv_ticket_fill$$)
where not exists (select 1 from cron.job where jobname='refresh_mv_ticket_fill');
