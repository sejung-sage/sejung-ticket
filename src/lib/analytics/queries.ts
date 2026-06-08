import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BuildingUtil,
  Course,
  DashboardFilters,
  FilterOptions,
  GridRoom,
  GridSession,
  Granularity,
  Kpis,
  RoomUtil,
  TrendPoint,
} from "./types";

// 집계는 전부 analytics.dash_* RPC(DB)가 수행한다.
// 앱은 작은 결과만 받는다 — 419k 원천은 물론 6.9k 집계 뷰도 직접 fetch하지 않는다.
// (PostgREST는 서버사이드 aggregate 비활성 + max-rows 1000 캡이라 RPC 경유가 필수.)
function analyticsDb() {
  return createAdminClient().schema("analytics");
}

/** dash_kpis / dash_trend 공통 필터 인자 (null = 전체). */
function filterArgs(f: DashboardFilters) {
  return {
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_building: f.building ?? null,
    p_classroom: f.classroom ?? null,
    p_dow: f.dow && f.dow.length > 0 ? f.dow : null,
  };
}

const EMPTY_KPIS: Kpis = {
  avg_utilization: null,
  total_occupied_hours: null,
  total_sessions: 0,
  avg_fill_rate: null,
  unpaid_rate: null,
  unparsed_sessions: 0,
  room_day_count: 0,
};

/** 필터 드롭다운용 건물/강의실 목록 + 데이터 가용 기간. */
export async function getFilterOptions(): Promise<FilterOptions> {
  const { data, error } = await analyticsDb().rpc("dash_filter_options");
  if (error) throw new Error(`dash_filter_options 실패: ${error.message}`);
  const row = data?.[0];
  return {
    buildings: row?.buildings ?? [],
    classrooms: row?.classrooms ?? [],
    min_date: row?.min_date ?? null,
    max_date: row?.max_date ?? null,
  };
}

/** KPI 카드 5개 + 데이터 품질 카운트. */
export async function getKpis(filters: DashboardFilters = {}): Promise<Kpis> {
  const { data, error } = await analyticsDb().rpc("dash_kpis", filterArgs(filters));
  if (error) throw new Error(`dash_kpis 실패: ${error.message}`);
  return data?.[0] ?? EMPTY_KPIS;
}

/** 가동률 추이(일/주). 차트용 시계열. */
export async function getUtilizationTrend(
  filters: DashboardFilters = {},
  granularity: Granularity = "day",
): Promise<TrendPoint[]> {
  const { data, error } = await analyticsDb().rpc("dash_trend", {
    ...filterArgs(filters),
    p_granularity: granularity,
  });
  if (error) throw new Error(`dash_trend 실패: ${error.message}`);
  return data ?? [];
}

/** 관별 가동률 비교(막대차트). 건물 필터는 무시(항상 전 관 비교). */
export async function getBuildingUtilization(
  filters: DashboardFilters = {},
): Promise<BuildingUtil[]> {
  const { data, error } = await analyticsDb().rpc("dash_building", {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_classroom: filters.classroom ?? null,
    p_dow: filters.dow && filters.dow.length > 0 ? filters.dow : null,
  });
  if (error) throw new Error(`dash_building 실패: ${error.message}`);
  return data ?? [];
}

// ── 강의실×시간 그리드 (하루) ─────────────────────────────────────────

/** 그리드 세로축: 대치 강의실 목록(정렬순). 그날 비어 있어도 행으로 노출. */
export async function getDaechiRooms(): Promise<GridRoom[]> {
  const { data, error } = await analyticsDb()
    .from("dim_classroom")
    .select("classroom, building, room, capacity")
    .eq("branch", "대치")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(`dim_classroom 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 특정 날짜의 모든 세션(대치). 하루치라 작음(1000행 캡 안전). */
export async function getDaySessions(date: string): Promise<GridSession[]> {
  const { data, error } = await analyticsDb()
    .from("vw_sessions")
    .select(
      "classroom, class_name, teacher_name, start_min, end_min, student_count, capacity, paid_count, unpaid_count",
    )
    .eq("class_date", date)
    .order("classroom")
    .order("start_min");
  if (error) throw new Error(`vw_sessions(일자) 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 강의실별 가동률(기간 집계) — /rooms 탭. */
export async function getRoomUtilization(filters: DashboardFilters = {}): Promise<RoomUtil[]> {
  const { data, error } = await analyticsDb().rpc("dash_room", {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_building: filters.building ?? null,
    p_dow: filters.dow && filters.dow.length > 0 ? filters.dow : null,
  });
  if (error) throw new Error(`dash_room 실패: ${error.message}`);
  return data ?? [];
}

/** 강좌별 관측/배정 강의실 — /assign 탭. */
export async function getCourses(search?: string, limit = 100): Promise<Course[]> {
  const { data, error } = await analyticsDb().rpc("dash_courses", {
    p_search: search && search.trim() ? search.trim() : null,
    p_limit: limit,
  });
  if (error) throw new Error(`dash_courses 실패: ${error.message}`);
  return data ?? [];
}

/** notAfter(보통 오늘) 이하에서 세션이 있는 가장 최근 날짜 — 그리드 기본값용. */
export async function getDefaultGridDate(notAfter: string): Promise<string | null> {
  const { data, error } = await analyticsDb()
    .from("mv_room_daily")
    .select("class_date")
    .lte("class_date", notAfter)
    .order("class_date", { ascending: false })
    .limit(1);
  if (error) throw new Error(`기본 날짜 조회 실패: ${error.message}`);
  return data?.[0]?.class_date ?? null;
}
