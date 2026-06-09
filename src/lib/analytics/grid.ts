// 강의실 × 3타임(아침/오후/저녁) 그리드 구성용 순수 함수.
import type { GridRoom, GridSession } from "./types";

export const TIME_BUCKETS = ["아침", "오후", "저녁"] as const;

/** 수업 시작 분(分) → 타임 버킷 인덱스. 아침<13시 / 오후13~17시 / 저녁≥17시. */
function bucketOf(startMin: number | null): number | null {
  if (startMin == null) return null;
  if (startMin < 780) return 0; // < 13:00
  if (startMin < 1020) return 1; // 13:00 ~ 17:00
  return 2; // ≥ 17:00
}

/** (강의실 × 타임) 한 칸 = 그 타임에 열린 세션 합산. */
export type GridCell = {
  students: number; // 등록(티켓)
  capacity: number; // 물리 정원(상수)
  absent: number; // 결석
  unpaid: number;
  sessions: number;
  classNames: string[];
  paidFill: number | null; // 가동좌석수: 등록/정원
  attendFill: number | null; // 출석률: (등록-결석)/등록 (과거만, 미래는 null)
};

export type RoomRow = { room: GridRoom; cells: (GridCell | null)[] };

export type GridModel = {
  rows: RoomRow[];
  isPast: boolean; // 과거 날짜면 출석 표시
  totals: { sessions: number; students: number; absent: number; rooms: number };
};

export function buildGrid(
  rooms: GridRoom[],
  sessions: GridSession[],
  isPast: boolean,
): GridModel {
  const rowMap = new Map<string, RoomRow>();
  for (const room of rooms) rowMap.set(room.classroom, { room, cells: [null, null, null] });

  let totalSessions = 0;
  let totalStudents = 0;
  let totalAbsent = 0;

  for (const s of sessions) {
    const row = rowMap.get(s.classroom);
    if (!row) continue;
    totalSessions += 1;
    totalStudents += s.student_count;
    totalAbsent += s.absent_count;
    const b = bucketOf(s.start_min);
    if (b == null) continue; // 시간 미파싱 → 버킷 배치 불가

    const cap = row.room.capacity ?? 0;
    const cell: GridCell = row.cells[b] ?? {
      students: 0,
      capacity: cap,
      absent: 0,
      unpaid: 0,
      sessions: 0,
      classNames: [],
      paidFill: null,
      attendFill: null,
    };
    cell.students += s.student_count;
    cell.absent += s.absent_count;
    cell.unpaid += s.unpaid_count;
    cell.sessions += 1;
    cell.capacity = cap;
    if (!cell.classNames.includes(s.class_name)) cell.classNames.push(s.class_name);
    cell.paidFill = cap > 0 ? cell.students / cap : null;
    cell.attendFill =
      isPast && cell.students > 0
        ? Math.max(0, cell.students - cell.absent) / cell.students
        : null;
    row.cells[b] = cell;
  }

  return {
    rows: [...rowMap.values()],
    isPast,
    totals: { sessions: totalSessions, students: totalStudents, absent: totalAbsent, rooms: rooms.length },
  };
}

/** 충원율 → 셀 배경/글자색 (Tailwind 정적 클래스). */
export function fillColor(fill: number | null): string {
  if (fill == null) return "bg-zinc-100 text-zinc-400";
  if (fill >= 1.0) return "bg-rose-500 text-white";
  if (fill >= 0.75) return "bg-emerald-600 text-white";
  if (fill >= 0.5) return "bg-emerald-500 text-white";
  if (fill >= 0.25) return "bg-emerald-300 text-emerald-950";
  if (fill > 0) return "bg-emerald-100 text-emerald-800";
  return "bg-zinc-100 text-zinc-400";
}

export const fmtPct = (v: number | null): string =>
  v == null ? "—" : `${Math.round(v * 100)}%`;

/** 소수점 1자리 % (상단 KPI 카드용). */
export const fmtPct1 = (v: number | null): string =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;
