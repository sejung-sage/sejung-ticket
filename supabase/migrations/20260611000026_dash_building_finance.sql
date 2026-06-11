-- 관(건물)별 + 기간 롤업에 "매출 vs 임대료"를 추가.
--  · 가동률   = Σ점유분 / Σ운영분            (시간 점유)
--  · 배정률   = Σ(학생×시간) / Σ(정원×시간)   (좌석 배정, 물리정원=우리가 정한 최대정원)
--  · 출석율   = Σ(등록−결석) / Σ등록          (과거 날짜만)
--  · 매출     = Σ class_amount_per_session     (회당금액×티켓수, 전체 발생매출·결제/미래 무관)
--  · 임대료   = dim_lease 월임대료 합을 기간 일수로 비례환산(월=30.44일)
--  · 매출배율 = 기간매출 ÷ 기간임대료
-- 관 목록은 dim_lease 기준(6개 관 전부 노출). 입시관·학종관은 usage 없어 매출/가동률 null.
drop function if exists analytics.dash_building_period(date, date, text);
create function analytics.dash_building_period(
  p_from date default null, p_to date default null, p_building text default null
)
returns table (
  building text, rooms bigint, capacity bigint,
  util numeric, seat_fill numeric, attend_rate numeric,
  booked bigint, sessions bigint,
  revenue bigint, area_py bigint, rent_monthly bigint,
  deposit bigint, maintenance bigint, rent_period bigint, rev_per_rent numeric
) language sql stable as $$
  with bld as (  -- 표시할 관 목록(임대 계약이 있는 6개 관)
    select distinct building from analytics.dim_lease
    where branch = '대치' and (p_building is null or building = p_building)
  ),
  rd as (
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
  rev as (  -- 전체 발생매출: aca_tickets 직접(티켓=학생-세션 1건, 회당금액 합)
    select split_part(classroom, ' ', 1) as building,
      sum(class_amount_per_session)::bigint as revenue
    from public.aca_tickets
    where branch = '대치' and classroom is not null and class_date <> '2050-01-01'
      and (p_from is null or class_date >= p_from)
      and (p_to is null or class_date <= p_to)
      and (p_building is null or split_part(classroom, ' ', 1) = p_building)
    group by 1
  ),
  cap as (
    select building, sum(capacity)::bigint as cap
    from analytics.dim_classroom where branch = '대치' group by building
  ),
  lease as (
    select building,
      sum(area_py)::bigint as area_py, sum(rent_monthly)::bigint as rent_monthly,
      sum(deposit)::bigint as deposit, sum(maintenance)::bigint as maintenance
    from analytics.dim_lease where branch = '대치' group by building
  ),
  prd as (  -- 기간 일수(둘 다 지정됐을 때만 임대료 비례환산)
    select case when p_from is not null and p_to is not null
      then (p_to - p_from + 1)::numeric end as days
  )
  select bld.building, rd.rooms, cap.cap,
    round(rd.occ::numeric / nullif(rd.opn, 0), 4) as util,
    round(rd.smin::numeric / nullif(rd.cmin, 0), 4) as seat_fill,
    round(att.attended_past::numeric / nullif(att.booked_past, 0), 4) as attend_rate,
    coalesce(rd.booked, 0)::bigint as booked,
    coalesce(rd.sess, 0)::bigint as sessions,
    rev.revenue,
    lease.area_py, lease.rent_monthly, lease.deposit, lease.maintenance,
    round(lease.rent_monthly * (select days from prd) / 30.44)::bigint as rent_period,
    round(rev.revenue::numeric
          / nullif(round(lease.rent_monthly * (select days from prd) / 30.44), 0), 2) as rev_per_rent
  from bld
  left join rd    on rd.building    = bld.building
  left join att   on att.building   = bld.building
  left join rev   on rev.building   = bld.building
  left join cap   on cap.building   = bld.building
  left join lease on lease.building = bld.building
  order by rev_per_rent desc nulls last
$$;

grant execute on function analytics.dash_building_period(date, date, text)
  to anon, authenticated, service_role;
