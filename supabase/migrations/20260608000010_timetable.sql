-- 시간표 적재 테이블 (HWP 파싱 결과). 교사+요일+시간 → 강의실.
create table if not exists analytics.timetable (
  id           bigserial primary key,
  source_date  date not null,        -- 시간표 파일 날짜
  weekday      int  not null,        -- isodow 1=월..7=일
  classroom_raw text not null,       -- 시간표 헤더 원본 (예 "대치관 2층 100")
  classroom    text,                 -- 정규화 (dim_classroom.classroom, 매칭안되면 null)
  teacher      text not null,        -- T 제거 정규화 (예 "최원영")
  time_norm    text,                 -- 시간 (~ → -)
  start_min    int,
  end_min      int,
  detail       text
);
create index if not exists timetable_match on analytics.timetable (weekday, teacher, start_min, end_min);
grant select on analytics.timetable to anon, authenticated, service_role;
grant insert, update, delete on analytics.timetable to service_role;
grant usage, select on sequence analytics.timetable_id_seq to service_role;
