// analytics 대시보드 데이터 레이어 타입.
// DB 집계 RPC(analytics.dash_*) 반환 형태와 1:1로 대응한다.

/** 대시보드 공통 필터. 모든 값 선택(없으면 전체). */
export type DashboardFilters = {
  from?: string | null; // 'YYYY-MM-DD' 포함
  to?: string | null; // 'YYYY-MM-DD' 포함
  building?: string | null; // 관 (예: '대치관')
  classroom?: string | null; // 강의실 (예: '대치관 201')
  dow?: number[] | null; // 요일 1=월 … 7=일
};

export type Granularity = "day" | "week";

/** dash_kpis — 1행 */
export type Kpis = {
  avg_utilization: number | null; // Σ점유 / Σ운영 (0~1)
  total_occupied_hours: number | null; // Σ점유분 / 60
  total_sessions: number;
  avg_fill_rate: number | null; // Σ학생 / Σ정원 (강좌 모집정원 기준)
  unpaid_rate: number | null; // Σ미납 / Σ학생
  unparsed_sessions: number; // 시간 미파싱 → 가동집계 제외된 세션 수
  room_day_count: number; // 집계에 든 (강의실×날짜) 행수
};

/** dash_trend — N행 */
export type TrendPoint = {
  bucket: string; // 'YYYY-MM-DD' (주 단위면 주 시작일=월요일)
  utilization: number | null;
  occupied_min: number;
  operating_min: number;
};

/** dash_building — 관별 1행 */
export type BuildingUtil = {
  building: string;
  utilization: number | null;
  occupied_hours: number;
  sessions: number;
};

/** dash_filter_options — 필터 드롭다운/기간 */
export type FilterOptions = {
  buildings: string[];
  classrooms: { building: string; classroom: string }[];
  min_date: string | null;
  max_date: string | null;
};

// ── 강의실×시간 그리드 (하루) ─────────────────────────────────────────

/** dim_classroom 한 행 = 그리드 세로축(강의실). */
export type GridRoom = {
  classroom: string;
  building: string;
  room: string;
  capacity: number | null; // 물리 정원 (대치는 미입력=null)
};

/** vw_sessions 한 행 = 특정 날짜·강의실에 열린 1회 수업. */
export type GridSession = {
  classroom: string;
  class_name: string;
  teacher_name: string | null;
  start_min: number | null;
  end_min: number | null;
  student_count: number;
  capacity: number | null; // 강좌 모집정원 (현재 분모)
  paid_count: number;
  unpaid_count: number;
};
