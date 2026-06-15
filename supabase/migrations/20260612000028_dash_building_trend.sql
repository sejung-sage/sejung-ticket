-- 가동률 추이: 관(building) × 월(YYYY-MM)별 가동률·좌석 점유율 시계열.
--  · 가동률      = Σ점유분 / Σ운영분
--  · 좌석 점유율 = Σ(등록×수업시간) / Σ(정원×수업시간)   (구 "배정률")
-- mv_room_daily(사전계산) 기반이라 빠름. usage 있는 관만 나옴(입시관·학종관 제외).
drop function if exists analytics.dash_building_trend(date, date);
create function analytics.dash_building_trend(
  p_from date default null, p_to date default null
)
returns table (building text, month text, util numeric, seat_fill numeric)
language sql stable as $$
  select building,
    to_char(class_date, 'YYYY-MM') as month,
    round(sum(occupied_min)::numeric / nullif(sum(operating_min), 0), 4) as util,
    round(sum(student_min)::numeric / nullif(sum(cap_min), 0), 4) as seat_fill
  from analytics.mv_room_daily
  where (p_from is null or class_date >= p_from)
    and (p_to is null or class_date <= p_to)
  group by building, to_char(class_date, 'YYYY-MM')
  order by month, building
$$;

grant execute on function analytics.dash_building_trend(date, date)
  to anon, authenticated, service_role;
