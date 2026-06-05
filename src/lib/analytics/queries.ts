import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BuildingUtil,
  DashboardFilters,
  FilterOptions,
  Granularity,
  Kpis,
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
