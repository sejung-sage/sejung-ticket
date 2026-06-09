-- 관(건물)별 + 기간 롤업: 가동률·배정률·출석율 3지표를 한 번에.
--  · 가동률   = Σ점유분 / Σ운영분            (시간 점유, 수업 있던 강의실-일 기준)
--  · 배정률   = Σ(학생×시간) / Σ(정원×시간)   (좌석 배정, 시간가중·물리정원)
--  · 출석율   = Σ(등록−결석) / Σ등록          (과거 날짜만 — 미래는 결석 없음)
-- 대치 전용(vw_sessions·mv_room_daily이 대치 한정). p_building으로 단일 관 필터 가능.
create or replace function analytics.dash_building_period(
  p_from date default null, p_to date default null, p_building text default null
)
returns table (
  building text, rooms bigint, capacity bigint,
  util numeric, seat_fill numeric, attend_rate numeric,
  booked bigint, sessions bigint
) language sql stable as $$
  with rd as (
    select building,
      count(distinct classroom) as rooms,
      sum(occupied_min) as occ, sum(operating_min) as opn,
      sum(student_min) as smin, sum(cap_min) as cmin,
      sum(student_sum) as booked, sum(session_count) as sess
    from analytics.mv_room_daily
    where (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or building = p_building)
    group by building
  ),
  att as (  -- 출석율은 과거만 (미래는 결석 미기록 → 과대평가 방지)
    select building,
      sum(student_count) as booked_past,
      sum(greatest(student_count - absent_count, 0)) as attended_past
    from analytics.vw_sessions
    where class_date < current_date
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or building = p_building)
    group by building
  ),
  cap as (
    select building, sum(capacity)::bigint as cap
    from analytics.dim_classroom where branch = '대치' group by building
  )
  select rd.building, rd.rooms, cap.cap,
    round(rd.occ::numeric / nullif(rd.opn, 0), 4) as util,
    round(rd.smin::numeric / nullif(rd.cmin, 0), 4) as seat_fill,
    round(att.attended_past::numeric / nullif(att.booked_past, 0), 4) as attend_rate,
    coalesce(rd.booked, 0)::bigint as booked,
    coalesce(rd.sess, 0)::bigint as sessions
  from rd
  left join att on att.building = rd.building
  left join cap on cap.building = rd.building
  order by util desc nulls last
$$;

grant execute on function analytics.dash_building_period(date, date, text)
  to anon, authenticated, service_role;
