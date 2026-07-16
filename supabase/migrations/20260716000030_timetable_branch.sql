-- 반포 시간표(XLSX) 적재 대비: timetable에 branch 추가.
-- 반포 '본관 301'이 대치 '본관 301'과 classroom 문자열이 겹치므로 branch로 구분한다.
-- 기존 행은 전부 대치(HWP 업로드분) → default '대치'.
alter table analytics.timetable add column if not exists branch text not null default '대치';
create index if not exists timetable_branch_date on analytics.timetable (branch, source_date);

-- vw_sessions: 현행 대시보드는 대치 전용이므로 대치 행만 사용 (컬럼 불변 → replace 가능).
-- 반포 행은 테이블에만 적재되고 지점별 대시보드(Phase 2)에서 소비 예정.
create or replace view analytics.vw_sessions as
with d as (
  select classroom, teacher, time_norm, start_min, end_min, detail, source_date as class_date
  from analytics.timetable
  where classroom is not null and start_min is not null
    and branch = '대치'
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

-- HWP 업로드 RPC(대치 전용): 같은 날짜의 반포 행을 지우지 않도록 delete를 branch 스코프로.
create or replace function analytics.import_timetable(p_source_date date, p_weekday int, p_cells jsonb)
returns int language plpgsql as $$
declare cell jsonb; tnorm text; pr record; n int := 0;
begin
  delete from analytics.timetable where source_date = p_source_date and branch = '대치';
  for cell in select * from jsonb_array_elements(p_cells) loop
    tnorm := nullif(replace(replace(coalesce(cell->>'time_raw',''), '~','-'), '.',''), '');
    select * into pr from analytics.parse_time_range(tnorm);
    insert into analytics.timetable
      (source_date, weekday, classroom_raw, classroom, teacher, time_norm, start_min, end_min, detail)
    values
      (p_source_date, p_weekday, cell->>'room_raw', analytics.norm_room(cell->>'room_raw'),
       cell->>'teacher', tnorm, pr.start_min, pr.end_min, cell->>'detail');
    n := n + 1;
  end loop;
  return n;
end $$;
