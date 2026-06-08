// 강의실×시간 그리드 구성용 순수 함수 (서버/클라이언트 무관, 테스트 가능).
import type { GridRoom, GridSession } from "./types";

/** (강의실, 시각) 한 칸 = 그 시간대에 활성인 세션들의 합산. */
export type GridCell = {
  students: number;
  capacity: number; // 합산 분모 (강좌 모집정원 합)
  paid: number;
  unpaid: number;
  fill: number | null; // students / capacity (capacity 0이면 null)
  sessions: number; // 칸에 겹친 세션 수
  classNames: string[];
};

export type RoomRow = {
  room: GridRoom;
  cells: (GridCell | null)[]; // hours 길이와 동일, 없으면 null
  dayStudents: number; // 그날 이 강의실 총 학생(세션 합)
  daySessions: number;
};

export type GridModel = {
  hours: number[]; // 가로축 시각(정수 시). 예: [9,10,…,22]
  rows: RoomRow[];
  totals: { sessions: number; students: number; rooms: number };
};

const DEFAULT_OPEN = 9;
const DEFAULT_CLOSE = 22;

/** 세션들이 점유하는 정수 시 범위에서 가로축 시각 배열을 만든다. */
function deriveHours(sessions: GridSession[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of sessions) {
    if (s.start_min == null || s.end_min == null) continue;
    min = Math.min(min, Math.floor(s.start_min / 60));
    max = Math.max(max, Math.ceil(s.end_min / 60));
  }
  if (!isFinite(min) || !isFinite(max)) {
    min = DEFAULT_OPEN;
    max = DEFAULT_CLOSE;
  }
  // 운영시간 기본범위와 합쳐 너무 좁지 않게
  min = Math.min(min, DEFAULT_OPEN);
  max = Math.max(max, DEFAULT_CLOSE);
  const hours: number[] = [];
  for (let h = min; h < max; h++) hours.push(h);
  return hours;
}

export function buildGrid(rooms: GridRoom[], sessions: GridSession[]): GridModel {
  const hours = deriveHours(sessions);
  const hourIndex = new Map(hours.map((h, i) => [h, i]));

  // 강의실별 빈 셀 배열 준비
  const rowMap = new Map<string, RoomRow>();
  for (const room of rooms) {
    rowMap.set(room.classroom, {
      room,
      cells: hours.map(() => null),
      dayStudents: 0,
      daySessions: 0,
    });
  }

  let totalSessions = 0;
  let totalStudents = 0;

  for (const s of sessions) {
    const row = rowMap.get(s.classroom);
    if (!row) continue; // dim_classroom에 없는 강의실(이론상 없음)
    totalSessions += 1;
    totalStudents += s.student_count;
    row.dayStudents += s.student_count;
    row.daySessions += 1;
    if (s.start_min == null || s.end_min == null) continue; // 미파싱 → 시간축 배치 불가

    const from = Math.floor(s.start_min / 60);
    const to = Math.ceil(s.end_min / 60);
    for (let h = from; h < to; h++) {
      const idx = hourIndex.get(h);
      if (idx == null) continue;
      const prev = row.cells[idx];
      const cell: GridCell = prev ?? {
        students: 0,
        capacity: 0,
        paid: 0,
        unpaid: 0,
        fill: null,
        sessions: 0,
        classNames: [],
      };
      cell.students += s.student_count;
      cell.capacity += s.capacity ?? 0;
      cell.paid += s.paid_count;
      cell.unpaid += s.unpaid_count;
      cell.sessions += 1;
      if (!cell.classNames.includes(s.class_name)) cell.classNames.push(s.class_name);
      cell.fill = cell.capacity > 0 ? cell.students / cell.capacity : null;
      row.cells[idx] = cell;
    }
  }

  return {
    hours,
    rows: [...rowMap.values()],
    totals: { sessions: totalSessions, students: totalStudents, rooms: rooms.length },
  };
}

/** 충원율 → 셀 배경/글자색 (Tailwind 정적 클래스). */
export function fillColor(fill: number | null): string {
  if (fill == null) return "bg-zinc-100 text-zinc-400";
  if (fill >= 1.0) return "bg-rose-500 text-white"; // 정원 초과
  if (fill >= 0.75) return "bg-emerald-600 text-white";
  if (fill >= 0.5) return "bg-emerald-500 text-white";
  if (fill >= 0.25) return "bg-emerald-300 text-emerald-950";
  if (fill > 0) return "bg-emerald-100 text-emerald-800";
  return "bg-zinc-100 text-zinc-400";
}

export const fmtPct = (v: number | null): string =>
  v == null ? "—" : `${Math.round(v * 100)}%`;
