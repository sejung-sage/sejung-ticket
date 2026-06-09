-- ★ 시간표를 원천으로 전환: vw_sessions = 시간표 세션(±14d) + 티켓 학생수 조인.
--   시간표 없는 날짜는 세션 0 → 화면 빈칸. 티켓 없는 클리닉도 방 사용으로 표시.

-- 0) 적재 RPC: 시간 정규화에 점(.) 제거 추가
create or replace function analytics.import_timetable(p_source_date date, p_weekday int, p_cells jsonb)
returns int language plpgsql as $$
declare cell jsonb; tnorm text; pr record; n int := 0;
begin
  delete from analytics.timetable where source_date = p_source_date;
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

-- 1) 의존 순서대로 drop
drop materialized view if exists analytics.mv_room_daily;
drop view if exists analytics.vw_room_daily;
drop view if exists analytics.vw_room_slots;
drop view if exists analytics.vw_sessions;
drop materialized view if exists analytics.mv_ticket_fill;
select cron.unschedule('refresh_mv_ticket_fill') where exists (select 1 from cron.job where jobname='refresh_mv_ticket_fill');

-- 2) vw_sessions = 시간표 기반
create view analytics.vw_sessions as
with d as (  -- 시간표 행 × 커버 날짜(같은 요일, ±14d), 날짜별 최근접 source만
  select classroom, teacher, time_norm, start_min, end_min, detail, class_date from (
    select tt.classroom, tt.teacher, tt.time_norm, tt.start_min, tt.end_min, tt.detail,
           gs::date as class_date,
           row_number() over (partition by gs::date, tt.classroom, tt.teacher, tt.time_norm
                              order by abs(gs::date - tt.source_date)) rn
    from analytics.timetable tt
    cross join lateral generate_series(tt.source_date - 14, tt.source_date + 14, interval '1 day') gs
    where tt.classroom is not null and tt.start_min is not null
      and extract(isodow from gs)::int = tt.weekday
  ) z where rn = 1
),
tix as (  -- 티켓 → (날짜, 교사, 시간) 집계
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

-- 3) vw_room_slots
create view analytics.vw_room_slots as
select distinct s.building, s.classroom, s.class_date, s.dow, gs as slot_min
from analytics.vw_sessions s
cross join lateral generate_series(s.start_min, s.end_min - 30, 30) as gs
where s.time_parse_ok;

-- 4) vw_room_daily
create view analytics.vw_room_daily as
with occ as (select building,classroom,class_date,dow,count(*)*30 as occupied_min
  from analytics.vw_room_slots group by 1,2,3,4),
sess as (select building,classroom,class_date,dow,
    count(*) as session_count, count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum, sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum, sum(unpaid_count) as unpaid_sum,
    sum(student_count*duration_min) filter (where time_parse_ok) as student_min,
    sum(coalesce(room_capacity,0)*duration_min) filter (where time_parse_ok) as cap_min,
    count(distinct case when start_min<780 then 1 when start_min<1020 then 2 else 3 end)
      filter (where time_parse_ok) as buckets_used,
    sum(student_count) filter (where time_parse_ok and start_min<780) as t_morning,
    sum(student_count) filter (where time_parse_ok and start_min>=780 and start_min<1020) as t_afternoon,
    sum(student_count) filter (where time_parse_ok and start_min>=1020) as t_evening
  from analytics.vw_sessions group by 1,2,3,4)
select s.building,s.classroom,s.class_date,s.dow,
  coalesce(o.occupied_min,0) as occupied_min,(c.close_min-c.open_min) as operating_min,
  round(coalesce(o.occupied_min,0)::numeric/nullif(c.close_min-c.open_min,0),4) as utilization,
  s.session_count,s.parsed_session_count,s.student_sum,s.capacity_sum,
  round(s.student_sum::numeric/nullif(s.capacity_sum,0),4) as fill_rate,
  s.paid_sum,s.unpaid_sum,round(s.unpaid_sum::numeric/nullif(s.student_sum,0),4) as unpaid_rate,
  s.student_min,s.cap_min,s.buckets_used,
  coalesce(s.t_morning,0) t_morning, coalesce(s.t_afternoon,0) t_afternoon, coalesce(s.t_evening,0) t_evening
from sess s left join occ o using (building,classroom,class_date,dow)
left join analytics.config_operating_hours c on c.day_type = case when s.dow in (6,7) then 'weekend' else 'weekday' end;

-- 5) mv_room_daily
create materialized view analytics.mv_room_daily as select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk on analytics.mv_room_daily (classroom, class_date);
create index mv_room_daily_date on analytics.mv_room_daily (class_date);
create index mv_room_daily_bld on analytics.mv_room_daily (building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;
