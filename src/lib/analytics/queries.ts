import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BuildingPeriod,
  BuildingTrend,
  BuildingUtil,
  DashboardFilters,
  FilterOptions,
  GridRoom,
  GridSession,
  Granularity,
  Kpis,
  LeaseLine,
  RoomSessionUtil,
  RoomUtil,
  SeatUtil,
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

/** 관별 + 기간 3지표(가동률·배정률·출석율). p_building 지정 시 단일 관만. */
export async function getBuildingPeriod(
  filters: DashboardFilters = {},
): Promise<BuildingPeriod[]> {
  const { data, error } = await analyticsDb().rpc("dash_building_period", {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_building: filters.building ?? null,
    p_branch: filters.branch ?? "대치",
  });
  if (error) throw new Error(`dash_building_period 실패: ${error.message}`);
  return (data ?? []) as BuildingPeriod[];
}

/** 관별 × 월별 추이(가동률·좌석 점유율). 가동률 추이 차트용. */
export async function getBuildingTrend(
  filters: DashboardFilters = {},
): Promise<BuildingTrend[]> {
  const { data, error } = await analyticsDb().rpc("dash_building_trend", {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
  });
  if (error) throw new Error(`dash_building_trend 실패: ${error.message}`);
  return (data ?? []) as BuildingTrend[];
}

/** 분원별 관·계약 구조 (분원/관 선택 옵션용). dim_lease distinct. */
export async function getLeaseHierarchy(): Promise<{ branch: string; building: string }[]> {
  const { data, error } = await analyticsDb()
    .from("dim_lease")
    .select("branch, building")
    .order("branch")
    .order("building");
  if (error) throw new Error(`dim_lease 계층 조회 실패: ${error.message}`);
  const seen = new Set<string>();
  const out: { branch: string; building: string }[] = [];
  for (const r of (data ?? []) as { branch: string; building: string }[]) {
    const k = `${r.branch}|${r.building}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

/** 관 안의 계약(층)별 비용 — 드릴다운용. 18행 안팎이라 직접 fetch 안전. */
export async function getLeaseLines(branch = "대치"): Promise<LeaseLine[]> {
  const { data, error } = await analyticsDb()
    .from("dim_lease")
    .select(
      "building, lease_label, building_name, area_py, rent_monthly, deposit, maintenance, lease_from, lease_to, note",
    )
    .eq("branch", branch)
    .order("building")
    .order("sort_order");
  if (error) throw new Error(`dim_lease 조회 실패: ${error.message}`);
  return (data ?? []) as LeaseLine[];
}

// ── 강의실×시간 그리드 (하루) ─────────────────────────────────────────

/** 그리드 세로축: 대치 강의실 목록(정렬순). 그날 비어 있어도 행으로 노출. */
export async function getDaechiRooms(): Promise<GridRoom[]> {
  return getRoomsByBranch("대치");
}

/** 분원별 강의실 목록(정렬순). 정원 관리 등 분원 전환용. */
export async function getRoomsByBranch(branch: string): Promise<GridRoom[]> {
  const { data, error } = await analyticsDb()
    .from("dim_classroom")
    .select("classroom, building, room, capacity")
    .eq("branch", branch)
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
      "classroom, class_name, teacher_name, start_min, end_min, student_count, capacity, paid_count, unpaid_count, absent_count",
    )
    .eq("class_date", date)
    .order("classroom")
    .order("start_min");
  if (error) throw new Error(`vw_sessions(일자) 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 좌석(정원)×시간 가동률 2종 (M1 전체기준 · M2 가동기준). */
export async function getSeatUtil(filters: DashboardFilters = {}): Promise<SeatUtil> {
  const { data, error } = await analyticsDb().rpc("dash_seat_util", {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_building: filters.building ?? null,
    p_dow: filters.dow && filters.dow.length > 0 ? filters.dow : null,
  });
  if (error) throw new Error(`dash_seat_util 실패: ${error.message}`);
  return (
    data?.[0] ?? { student_min: 0, m1_denom: 0, m2_denom: 0, m1_util: null, m2_util: null }
  );
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

/** 강의실별 세션 지표(기간) — /rooms 탭. */
export async function getRoomSessionUtil(filters: DashboardFilters = {}): Promise<RoomSessionUtil[]> {
  const { data, error } = await analyticsDb().rpc("dash_room_session", {
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_building: filters.building ?? null,
    p_dow: filters.dow && filters.dow.length > 0 ? filters.dow : null,
  });
  if (error) throw new Error(`dash_room_session 실패: ${error.message}`);
  return data ?? [];
}

/** 시간표 적재 현황 — 날짜별 칸수/강의실매칭 (업로드 탭). 분원별 분리. */
export async function getTimetableStatus(branch: string): Promise<
  { source_date: string; weekday: number; cells: number; rooms: number }[]
> {
  // 집계는 서버(RPC)에서 — timetable 행수가 PostgREST 1000행 캡을 넘으면 클라이언트
  // 집계 시 최근 적재분이 잘려 누락됨.
  const { data, error } = await analyticsDb().rpc("dash_timetable_status", { p_branch: branch });
  if (error) throw new Error(`timetable 조회 실패: ${error.message}`);
  return ((data ?? []) as { source_date: string; weekday: number; cells: number; rooms: number }[]).map(
    (r) => ({
      source_date: r.source_date,
      weekday: r.weekday,
      cells: Number(r.cells),
      rooms: Number(r.rooms),
    }),
  );
}

/** 그 날짜의 강의실당 운영 세션 수 (주말 3·방학평일 3·학기중평일 1). */
export async function getDayOpSessions(date: string): Promise<number> {
  const { data, error } = await analyticsDb().rpc("day_op_sessions", { d: date });
  if (error) throw new Error(`day_op_sessions 실패: ${error.message}`);
  return (data as number) ?? 1;
}

/** 방학 기간 목록 — /term 탭. */
export async function getVacationPeriods(): Promise<
  { id: number; from_date: string; to_date: string; label: string | null }[]
> {
  const { data, error } = await analyticsDb()
    .from("config_term")
    .select("id, from_date, to_date, label")
    .order("from_date", { ascending: false });
  if (error) throw new Error(`config_term 조회 실패: ${error.message}`);
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
