-- =====================================================================
-- 임대차 계약 마스터(dim_lease) — 관(building) 안의 계약(층) 단위 비용
-- 한 관이 여러 층 계약으로 나뉨(예: 대치관 = 1~3층·4층·5~7층). 계약별로
-- 임차면적(평)·월임대료·보증금·관리비·계약기간을 보관하고, 관별로 롤업해
-- /buildings 대시보드에서 매출(강좌 회당금액×티켓수) 대비 임대료를 비교한다.
-- ⚠️ 수기 관리(임대 계약서 기준). 시드는 supabase/seed/dim_lease_seed.sql.
-- =====================================================================

create table if not exists analytics.dim_lease (
  branch        text not null default '대치',     -- 분원
  building      text not null,                     -- 관: 대치관/양지관… (dim_classroom.building 과 일치)
  lease_label   text not null,                     -- 계약(층) 라벨: "1~3층" / "B1" / "4층(사무실)"
  building_name text,                              -- 임대 건물명: 대치빌딩/양지빌딩…
  area_py       int,                               -- 임차 면적(평)
  rent_monthly  bigint,                            -- 월 임대료(VAT포함)
  deposit       bigint,                            -- 임차보증금
  maintenance   bigint,                            -- 관리비(VAT포함). 미상/없음이면 null
  lease_from    date,
  lease_to      date,
  sort_order    int,
  note          text,
  primary key (branch, building, lease_label)
);

comment on table analytics.dim_lease is '임대차 계약 마스터: 관 안의 계약(층)별 면적·임대료·보증금·관리비·기간 (수기 관리)';

grant select on analytics.dim_lease to anon, authenticated, service_role;
-- "관 관리" 화면이 service_role(admin 클라이언트)로 수정하므로 쓰기 권한 부여(dim_classroom 과 동일).
grant insert, update, delete on analytics.dim_lease to service_role;
