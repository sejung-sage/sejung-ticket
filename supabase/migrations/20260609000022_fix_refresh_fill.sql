-- 시간표 기반 전환(019)에서 mv_ticket_fill을 drop했으나 refresh_fill()이 여전히
-- 그 MV를 refresh하려다 실패("relation analytics.mv_ticket_fill does not exist")했다.
-- vw_sessions는 이제 일반 view이므로 mv_room_daily만 갱신하면 된다.
-- 또한 REFRESH는 MV 소유자만 가능 → service_role 호출이 거부되므로 SECURITY DEFINER로
-- 소유자(postgres) 권한 실행. search_path 고정으로 하이재킹 방지(객체는 모두 정규화).
create or replace function analytics.refresh_fill()
returns void language plpgsql
security definer set search_path = pg_catalog as $$
begin
  refresh materialized view analytics.mv_room_daily;
end $$;

grant execute on function analytics.refresh_fill() to service_role;
