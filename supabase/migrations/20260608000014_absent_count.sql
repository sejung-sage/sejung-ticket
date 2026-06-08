-- vw_sessions에 결석수(absent_count) 추가 (출석 = 등록 - 결석). 컬럼 끝에 append → 안전.
-- 대치는 출석을 안 찍고 결석만 찍으므로 출석인원 = 학생수 - 결석.
create or replace view analytics.vw_sessions as
with src as (
  select t.*, coalesce(t.classroom, nf.classroom) as classroom_eff
  from public.aca_tickets t
  left join analytics.mv_ticket_fill nf on nf.id = t.id
  where t.branch = '대치' and t.class_date <> '2050-01-01'
),
agg as (
  select split_part(classroom_eff,' ',1) as building, classroom_eff as classroom,
    class_date, extract(isodow from class_date)::int as dow, class_name,
    max(schedule_days) as schedule_days, max(schedule_time) as schedule_time,
    max(teacher_name) as teacher_name, max(subject_raw) as subject,
    max(class_grade) as class_grade, max(class_type1) as class_type1, max(class_capacity) as capacity,
    max(aca_class_id) as aca_class_id,
    count(*) as student_count,
    count(*) filter (where payment_state in ('결제완료','°áÁ¦¿Ï·á')) as paid_count,
    count(*) filter (where payment_state in ('결제전','°áÁ¦Àü')) as unpaid_count
  from src where classroom_eff is not null group by 1,2,3,4,5
)
select a.building,a.classroom,a.class_date,a.dow,a.class_name,a.schedule_days,a.schedule_time,
  a.teacher_name,a.subject,a.class_grade,a.class_type1,a.capacity,a.student_count,a.paid_count,a.unpaid_count,
  t.start_min,t.end_min,
  case when t.start_min is not null then t.end_min-t.start_min end as duration_min,
  (t.start_min is not null) as time_parse_ok,
  dc.capacity as room_capacity,
  round(a.student_count::numeric/nullif(dc.capacity,0),4) as seat_fill_rate,
  coalesce(att.absent,0) as absent_count
from agg a
left join lateral analytics.parse_time_range(a.schedule_time) t on true
left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=a.classroom
left join (
  select aca_class_id, attended_at, count(*) filter (where status='결석') as absent
  from public.aca_attendances group by 1,2
) att on att.aca_class_id = a.aca_class_id and att.attended_at = a.class_date;
