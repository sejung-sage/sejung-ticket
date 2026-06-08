-- 강좌→강의실 배정 탭용: 강좌별 관측 강의실(최빈값) + 현재 배정 조회
create or replace function analytics.dash_courses(
  p_search text default null,
  p_limit  int  default 100
)
returns table (
  class_name         text,
  observed_classroom text,   -- 데이터상 가장 많이 쓰인 강의실(최빈값)
  sessions           bigint,
  teacher_name       text,
  assigned_classroom text    -- 수동 배정값(class_room_assignment)
)
language sql
stable
as $$
  with agg as (
    select
      class_name,
      mode() within group (order by classroom)    as observed_classroom,
      mode() within group (order by teacher_name)  as teacher_name,
      count(*)                                      as sessions
    from analytics.vw_sessions
    where (p_search is null or class_name ilike '%' || p_search || '%')
    group by class_name
  )
  select a.class_name, a.observed_classroom, a.sessions, a.teacher_name, cra.classroom
  from agg a
  left join analytics.class_room_assignment cra on cra.class_name = a.class_name
  order by a.sessions desc
  limit p_limit;
$$;
grant execute on function analytics.dash_courses(text,int) to anon, authenticated, service_role;
