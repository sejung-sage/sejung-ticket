-- 인코딩 깨진 교사명 복구 + 매칭 적용.
-- ⚠️ mv_ticket_fill 정의를 바꾸려면 의존 체인(vw_sessions→slots→daily→mv_room_daily)을
--    의존 순서대로 drop 후 전체 재생성해야 한다 (cascade 단독 사용 금지 — 체인이 통째로 날아감).

-- 0) 모지바케 복구 함수: 이미 한글이면 그대로, 아니면 latin1 바이트→UHC 디코드
create or replace function analytics.fix_teacher(s text)
returns text language plpgsql immutable as $$
begin
  if s is null or s ~ '[가-힣]' then return s; end if;
  return convert_from(convert_to(s, 'LATIN1'), 'UHC');
exception when others then
  return s;
end $$;

-- 1) 의존 순서대로 drop (자식 → 부모)
drop materialized view if exists analytics.mv_room_daily;
drop view if exists analytics.vw_room_daily;
drop view if exists analytics.vw_room_slots;
drop view if exists analytics.vw_sessions;
drop materialized view if exists analytics.mv_ticket_fill;

-- 2) mv_ticket_fill 재생성 (교사 매칭에 fix_teacher 적용)
create materialized view analytics.mv_ticket_fill as
  select distinct on (t.id) t.id, tt.classroom
  from public.aca_tickets t
  cross join lateral analytics.parse_time_range(t.schedule_time) pt
  join analytics.timetable tt
    on tt.classroom is not null
   and tt.weekday  = extract(isodow from t.class_date)::int
   and tt.teacher  = regexp_replace(analytics.fix_teacher(t.teacher_name), 'T\s*$', '')
   and tt.start_min = pt.start_min and tt.end_min = pt.end_min
   and abs(tt.source_date - t.class_date) <= 14
  where t.branch = '대치' and t.classroom is null and t.class_date <> '2050-01-01'
    and t.teacher_name is not null
  order by t.id, abs(tt.source_date - t.class_date)
with data;
create unique index mv_ticket_fill_pk on analytics.mv_ticket_fill (id);
grant select on analytics.mv_ticket_fill to anon, authenticated, service_role;

-- 3) vw_sessions (mv_ticket_fill 조인, null 채움)
create view analytics.vw_sessions as
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
  round(a.student_count::numeric/nullif(dc.capacity,0),4) as seat_fill_rate
from agg a
left join lateral analytics.parse_time_range(a.schedule_time) t on true
left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=a.classroom;

-- 4) vw_room_slots
create view analytics.vw_room_slots as
select distinct s.building, s.classroom, s.class_date, s.dow, gs as slot_min
from analytics.vw_sessions s
cross join lateral generate_series(s.start_min, s.end_min - 30, 30) as gs
where s.time_parse_ok;

-- 5) vw_room_daily
create view analytics.vw_room_daily as
with occ as (select building,classroom,class_date,dow,count(*)*30 as occupied_min
  from analytics.vw_room_slots group by 1,2,3,4),
sess as (select building,classroom,class_date,dow,
    count(*) as session_count, count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum, sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum, sum(unpaid_count) as unpaid_sum,
    sum(student_count*duration_min) filter (where time_parse_ok) as student_min,
    sum(coalesce(room_capacity,0)*duration_min) filter (where time_parse_ok) as cap_min
  from analytics.vw_sessions group by 1,2,3,4)
select s.building,s.classroom,s.class_date,s.dow,
  coalesce(o.occupied_min,0) as occupied_min,(c.close_min-c.open_min) as operating_min,
  round(coalesce(o.occupied_min,0)::numeric/nullif(c.close_min-c.open_min,0),4) as utilization,
  s.session_count,s.parsed_session_count,s.student_sum,s.capacity_sum,
  round(s.student_sum::numeric/nullif(s.capacity_sum,0),4) as fill_rate,
  s.paid_sum,s.unpaid_sum,round(s.unpaid_sum::numeric/nullif(s.student_sum,0),4) as unpaid_rate,
  s.student_min,s.cap_min
from sess s left join occ o using (building,classroom,class_date,dow)
left join analytics.config_operating_hours c on c.day_type = case when s.dow in (6,7) then 'weekend' else 'weekday' end;

-- 6) mv_room_daily 재생성 + 인덱스 + 권한
create materialized view analytics.mv_room_daily as select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk on analytics.mv_room_daily (classroom, class_date);
create index mv_room_daily_date on analytics.mv_room_daily (class_date);
create index mv_room_daily_bld on analytics.mv_room_daily (building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;
