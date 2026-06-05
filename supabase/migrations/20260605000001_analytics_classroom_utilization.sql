-- =====================================================================
-- 세정학원 강의실 가동률 — analytics 스키마 (읽기 전용 정제 레이어)
-- 원천 public.aca_tickets 는 무수정. 모든 가공은 이 스키마의 View가 수행.
-- 범위: branch = '대치' 캠퍼스, classroom 기록 있는 세션
-- =====================================================================

create schema if not exists analytics;

-- ---------------------------------------------------------------------
-- 1) 운영시간 설정 테이블 (가동률 분모). DML(UPDATE)로 무중단 조정 가능.
--    min 단위(자정 기준). 평일/주말 분리.
-- ---------------------------------------------------------------------
create table if not exists analytics.config_operating_hours (
  day_type   text primary key check (day_type in ('weekday', 'weekend')),
  open_min   int  not null,
  close_min  int  not null,
  check (close_min > open_min)
);

insert into analytics.config_operating_hours (day_type, open_min, close_min) values
  ('weekday', 540, 1320),   -- 09:00 ~ 22:00 (기본값, 실제 운영시간으로 조정하세요)
  ('weekend', 540, 1320)    -- 09:00 ~ 22:00 (기본값)
on conflict (day_type) do nothing;

-- ---------------------------------------------------------------------
-- 2) schedule_time 파서  (JS 프로토타입 98.4% 커버리지 → SQL 이식)
--    "18:00-22:00", "pm6-9", "P3:30-6", "am10-1", "09:00-4:30",
--    "상시"/"00:00-24:00" 등 처리. 파싱 불가 → (null, null).
-- ---------------------------------------------------------------------
create or replace function analytics.parse_time_range(raw text)
returns table (start_min int, end_min int)
language plpgsql
immutable
as $$
declare
  s    text;
  m    text[];
  p1   text; h1 int; mn1 int;
  p2   text; h2 int; mn2 int;
  cand int;
begin
  start_min := null;
  end_min   := null;
  if raw is null then return next; return; end if;

  s := lower(regexp_replace(raw, '\s+', '', 'g'));

  if s in ('상시', '00:00-24:00', '24:00') then
    start_min := 0; end_min := 1440; return next; return;
  end if;

  m := regexp_match(s, '^([a-z]*)([0-9]{1,2})(?::([0-9]{2}))?-([a-z]*)([0-9]{1,2})(?::([0-9]{2}))?');
  if m is null then return next; return; end if;

  p1 := m[1]; h1 := m[2]::int; mn1 := coalesce(m[3]::int, 0);
  p2 := m[4]; h2 := m[5]::int; mn2 := coalesce(m[6]::int, 0);

  -- 시작 시각 보정
  if p1 in ('pm', 'p') and h1 < 12 then h1 := h1 + 12; end if;
  if p1 in ('am', 'a') and h1 = 12 then h1 := 0;          end if;

  -- 종료 시각 보정
  if p2 in ('pm', 'p') and h2 < 12 then
    h2 := h2 + 12;
  elsif p2 in ('am', 'a') and h2 = 12 then
    h2 := 0;
  elsif p2 is null or p2 = '' then
    -- 접두사 없는 종료: 시작 맥락(오후) 반영 + 종료가 시작보다 작으면 +12
    cand := h2;
    if (p1 in ('pm', 'p') or h1 >= 12) and cand < 12 then cand := cand + 12; end if;
    if cand * 60 + mn2 <= h1 * 60 + mn1 then cand := cand + 12; end if;
    h2 := cand;
  end if;

  start_min := h1 * 60 + mn1;
  end_min   := h2 * 60 + mn2;

  if end_min <= start_min or end_min > 1440 or start_min < 0 then
    start_min := null; end_min := null;
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) vw_sessions  — 1행 = 세션 (강의실 × 날짜 × 강좌)
--    그레인: 원천 1행 = 학생1명. 세션으로 묶고 학생수 집계.
-- ---------------------------------------------------------------------
create or replace view analytics.vw_sessions as
with agg as (
  select
    split_part(classroom, ' ', 1)            as building,        -- 관 (대치관/양지관/우전관/본관/입시관)
    classroom,
    class_date,
    extract(isodow from class_date)::int      as dow,             -- 1=월 … 7=일
    class_name,
    max(schedule_days)                        as schedule_days,
    max(schedule_time)                        as schedule_time,
    max(teacher_name)                         as teacher_name,
    max(subject_raw)                          as subject,
    max(class_grade)                          as class_grade,
    max(class_type1)                          as class_type1,
    max(class_capacity)                       as capacity,
    count(*)                                  as student_count,
    count(*) filter (where payment_state in ('결제완료', '°áÁ¦¿Ï·á')) as paid_count,
    count(*) filter (where payment_state in ('결제전',   '°áÁ¦Àü'))   as unpaid_count
  from public.aca_tickets
  where branch = '대치'
    and classroom is not null
    and class_date <> '2050-01-01'
  group by 1, 2, 3, 4, 5
)
select
  a.building,
  a.classroom,
  a.class_date,
  a.dow,
  a.class_name,
  a.schedule_days,
  a.schedule_time,
  a.teacher_name,
  a.subject,
  a.class_grade,
  a.class_type1,
  a.capacity,
  a.student_count,
  a.paid_count,
  a.unpaid_count,
  t.start_min,
  t.end_min,
  case when t.start_min is not null then t.end_min - t.start_min end as duration_min,
  (t.start_min is not null)                                          as time_parse_ok
from agg a
left join lateral analytics.parse_time_range(a.schedule_time) t on true;

-- ---------------------------------------------------------------------
-- 4) vw_room_slots — 30분 슬롯 단위 점유 (겹침 자동 제거: DISTINCT)
--    가동시간/히트맵의 공통 피드.
-- ---------------------------------------------------------------------
create or replace view analytics.vw_room_slots as
select distinct
  s.building,
  s.classroom,
  s.class_date,
  s.dow,
  gs as slot_min
from analytics.vw_sessions s
cross join lateral generate_series(s.start_min, s.end_min - 30, 30) as gs
where s.time_parse_ok;

-- ---------------------------------------------------------------------
-- 5) vw_room_daily — 1행 = (강의실 × 날짜). 대시보드 핵심 집계.
-- ---------------------------------------------------------------------
create or replace view analytics.vw_room_daily as
with occ as (
  select building, classroom, class_date, dow, count(*) * 30 as occupied_min
  from analytics.vw_room_slots
  group by 1, 2, 3, 4
),
sess as (
  select
    building, classroom, class_date, dow,
    count(*)                                  as session_count,
    count(*) filter (where time_parse_ok)     as parsed_session_count,
    sum(student_count)                        as student_sum,
    sum(capacity)                             as capacity_sum,
    sum(paid_count)                           as paid_sum,
    sum(unpaid_count)                         as unpaid_sum
  from analytics.vw_sessions
  group by 1, 2, 3, 4
)
select
  s.building,
  s.classroom,
  s.class_date,
  s.dow,
  coalesce(o.occupied_min, 0)                 as occupied_min,
  (c.close_min - c.open_min)                  as operating_min,
  round(coalesce(o.occupied_min, 0)::numeric
        / nullif(c.close_min - c.open_min, 0), 4) as utilization,
  s.session_count,
  s.parsed_session_count,
  s.student_sum,
  s.capacity_sum,
  round(s.student_sum::numeric / nullif(s.capacity_sum, 0), 4) as fill_rate,
  s.paid_sum,
  s.unpaid_sum,
  round(s.unpaid_sum::numeric / nullif(s.student_sum, 0), 4)   as unpaid_rate
from sess s
left join occ o using (building, classroom, class_date, dow)
left join analytics.config_operating_hours c
  on c.day_type = case when s.dow in (6, 7) then 'weekend' else 'weekday' end;

-- ---------------------------------------------------------------------
-- 6) 권한 — anon/publishable 로도 읽기 가능하게 (선택). 서버는 secret 사용.
-- ---------------------------------------------------------------------
grant usage on schema analytics to anon, authenticated, service_role;
grant select on all tables in schema analytics to anon, authenticated, service_role;
-- 뷰는 위 grant에 포함됨. 향후 추가 뷰 기본 권한:
alter default privileges in schema analytics grant select on tables to anon, authenticated, service_role;
