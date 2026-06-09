-- 시간표는 올린 '그 날짜(source_date)'에만 적용. ±14일 요일반복 윈도우 제거.
create or replace view analytics.vw_sessions as
with d as (
  select classroom, teacher, time_norm, start_min, end_min, detail, source_date as class_date
  from analytics.timetable
  where classroom is not null and start_min is not null
),
tix as (
  select t.class_date,
    regexp_replace(analytics.fix_teacher(t.teacher_name),'T\s*$','') as teacher,
    p.start_min, p.end_min,
    count(*) as student_count,
    count(*) filter (where payment_state in ('결제완료','°áÁ¦¿Ï·á')) as paid_count,
    count(*) filter (where payment_state in ('결제전','°áÁ¦Àü')) as unpaid_count,
    max(t.aca_class_id) as aca_class_id, max(t.class_name) as class_name, max(t.subject_raw) as subject,
    max(t.class_grade) as class_grade, max(t.class_type1) as class_type1, max(t.class_capacity) as capacity
  from public.aca_tickets t
  cross join lateral analytics.parse_time_range(t.schedule_time) p
  where t.branch='대치' and t.class_date <> '2050-01-01' and p.start_min is not null
  group by 1,2,3,4
)
select
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
left join tix x on x.class_date=d.class_date and x.teacher=d.teacher and x.start_min=d.start_min and x.end_min=d.end_min
left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=d.classroom
left join (select aca_class_id, attended_at, count(*) filter(where status='결석') absent
           from public.aca_attendances group by 1,2) att
  on att.aca_class_id = x.aca_class_id and att.attended_at = d.class_date;
