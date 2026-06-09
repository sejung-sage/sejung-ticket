-- 세션 기반 강의실 지표: 하루 3세션(아침/오후/저녁), 운영세션 평일1·주말3.
-- ⚠️ vw_room_daily에 컬럼 추가(append) → mv_room_daily만 drop&recreate (체인 끝단, 안전).

-- 1) 운영 세션 설정 (조정 가능)
create table if not exists analytics.config_operating_sessions (
  day_type text primary key check (day_type in ('weekday','weekend')),
  sessions int not null check (sessions between 1 and 3)
);
insert into analytics.config_operating_sessions(day_type,sessions) values ('weekday',1),('weekend',3)
  on conflict (day_type) do nothing;
grant select on analytics.config_operating_sessions to anon, authenticated, service_role;
grant update on analytics.config_operating_sessions to service_role;

-- 2) vw_room_daily에 buckets_used(그날 그 방이 쓴 세션수 0~3) 추가
create or replace view analytics.vw_room_daily as
with occ as (select building,classroom,class_date,dow,count(*)*30 as occupied_min
  from analytics.vw_room_slots group by 1,2,3,4),
sess as (select building,classroom,class_date,dow,
    count(*) as session_count, count(*) filter (where time_parse_ok) as parsed_session_count,
    sum(student_count) as student_sum, sum(capacity) as capacity_sum,
    sum(paid_count) as paid_sum, sum(unpaid_count) as unpaid_sum,
    sum(student_count*duration_min) filter (where time_parse_ok) as student_min,
    sum(coalesce(room_capacity,0)*duration_min) filter (where time_parse_ok) as cap_min,
    count(distinct case when start_min < 780 then 1 when start_min < 1020 then 2 else 3 end)
      filter (where time_parse_ok) as buckets_used
  from analytics.vw_sessions group by 1,2,3,4)
select s.building,s.classroom,s.class_date,s.dow,
  coalesce(o.occupied_min,0) as occupied_min,(c.close_min-c.open_min) as operating_min,
  round(coalesce(o.occupied_min,0)::numeric/nullif(c.close_min-c.open_min,0),4) as utilization,
  s.session_count,s.parsed_session_count,s.student_sum,s.capacity_sum,
  round(s.student_sum::numeric/nullif(s.capacity_sum,0),4) as fill_rate,
  s.paid_sum,s.unpaid_sum,round(s.unpaid_sum::numeric/nullif(s.student_sum,0),4) as unpaid_rate,
  s.student_min,s.cap_min,s.buckets_used
from sess s left join occ o using (building,classroom,class_date,dow)
left join analytics.config_operating_hours c on c.day_type = case when s.dow in (6,7) then 'weekend' else 'weekday' end;

-- 3) mv_room_daily 재생성 (buckets_used 반영)
drop materialized view if exists analytics.mv_room_daily;
create materialized view analytics.mv_room_daily as select * from analytics.vw_room_daily with data;
create unique index mv_room_daily_pk on analytics.mv_room_daily (classroom, class_date);
create index mv_room_daily_date on analytics.mv_room_daily (class_date);
create index mv_room_daily_bld on analytics.mv_room_daily (building);
grant select on analytics.mv_room_daily to anon, authenticated, service_role;

-- 4) 세션 지표 RPC (강의실별)
--   m1 세션가동률 = 사용세션/운영세션 · m2 세션내좌석충원 = 티켓/(사용세션×정원)
--   m3 종합좌석충원 = 티켓/(운영세션×정원)  (= m1×m2)
create or replace function analytics.dash_room_session(
  p_from date default null, p_to date default null, p_building text default null, p_dow int[] default null)
returns table (building text, classroom text, operating_sessions bigint, used_sessions bigint,
  tickets bigint, capacity int, m1 numeric, m2 numeric, m3 numeric)
language sql stable as $$
  with cfg as (select max(case when day_type='weekday' then sessions end) wd,
                      max(case when day_type='weekend' then sessions end) we
               from analytics.config_operating_sessions),
  total_op as (
    select coalesce(sum(case when dow in (6,7) then (select we from cfg) else (select wd from cfg) end),0) total
    from (select distinct class_date, dow from analytics.mv_room_daily
          where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow=any(p_dow))) d
  ),
  rooms as (
    select rd.building, rd.classroom,
      sum(least(rd.buckets_used, case when rd.dow in (6,7) then (select we from cfg) else (select wd from cfg) end)) used,
      sum(rd.student_sum) tickets
    from analytics.mv_room_daily rd
    where (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
      and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow=any(p_dow))
    group by 1,2
  )
  select r.building, r.classroom,
    (select total from total_op)::bigint, r.used::bigint, r.tickets::bigint, dc.capacity,
    round(r.used::numeric/nullif((select total from total_op),0),4),
    round(r.tickets::numeric/nullif(r.used*dc.capacity,0),4),
    round(r.tickets::numeric/nullif((select total from total_op)*dc.capacity,0),4)
  from rooms r left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=r.classroom
  order by 9 desc nulls last;
$$;
grant execute on function analytics.dash_room_session(date,date,text,int[]) to anon, authenticated, service_role;
