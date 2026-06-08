-- =====================================================================
-- 강의실 마스터(dim_classroom) — 분원별 강의실/관/물리 수용인원
-- 원천 aca_tickets엔 강의실 메타가 없어(classroom 텍스트뿐) 정원 등을
-- 수기 관리하기 위한 참조 테이블. analytics.vw_sessions 와 (branch, classroom)
-- 으로 조인되어 "물리 정원 기준 좌석 충원율"을 계산한다.
-- ⚠️ 현재 usage(강의실 기록)가 있는 분원은 '대치'뿐. 타 분원은 참고용.
-- =====================================================================

create table if not exists analytics.dim_classroom (
  branch      text    not null,                 -- 분원: 대치/송도/반포/방배
  building    text    not null,                 -- 관: 대치관/양지관… 또는 1관/2관/수학
  room        text    not null,                 -- 호실: 201 / 1호실 / 5층
  classroom   text    not null,                 -- 원천 aca_tickets.classroom 매칭용 풀네임(조인키)
  capacity    int,                              -- 수용인원(물리 정원). 미상이면 null
  sort_order  int,                              -- 표시 정렬용
  active      boolean not null default true,    -- 폐쇄/미사용 강의실 토글
  note        text,
  primary key (branch, classroom)
);

comment on table  analytics.dim_classroom            is '강의실 마스터: 분원별 강의실/관/물리 수용인원 (수기 관리, 참조용)';
comment on column analytics.dim_classroom.classroom  is 'aca_tickets.classroom 와 정확히 일치해야 조인됨 (예: "대치관 201")';
comment on column analytics.dim_classroom.capacity   is '물리 수용인원. class_capacity(강좌 모집정원)와 다름';

-- ---------------------------------------------------------------------
-- vw_sessions 확장: 물리 정원(room_capacity) + 좌석 충원율(seat_fill_rate) 추가.
-- (create or replace 규칙상 기존 컬럼 순서 유지 + 끝에 신규 컬럼만 추가)
-- dim_classroom이 비어 있으면 두 값은 null → 기존 집계엔 영향 없음.
-- ---------------------------------------------------------------------
create or replace view analytics.vw_sessions as
with agg as (
  select
    split_part(classroom, ' ', 1)            as building,
    classroom,
    class_date,
    extract(isodow from class_date)::int      as dow,
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
  (t.start_min is not null)                                          as time_parse_ok,
  dc.capacity                                                        as room_capacity,
  round(a.student_count::numeric / nullif(dc.capacity, 0), 4)        as seat_fill_rate
from agg a
left join lateral analytics.parse_time_range(a.schedule_time) t on true
left join analytics.dim_classroom dc
  on dc.branch = '대치' and dc.classroom = a.classroom;

-- 권한
grant select on analytics.dim_classroom to anon, authenticated, service_role;
