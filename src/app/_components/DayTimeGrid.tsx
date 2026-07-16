// 강의실 × 실제 시간대(연속 타임라인) 일별 그리드 — 반포처럼 30분 단위 시간표가
// 정밀한 분원용. 아침/오후/저녁 3버킷 대신 세션을 시간 축 위 블록으로 그린다.
import type { GridRoom, GridSession } from "@/lib/analytics/types";
import { fillColor, fmtPct } from "@/lib/analytics/grid";

type Block = GridSession & { lane: number };

/** 같은 방에서 겹치는 세션은 아래 줄(lane)로 내려 그린다. */
function assignLanes(sessions: GridSession[]): { blocks: Block[]; lanes: number } {
  const sorted = [...sessions].sort((a, b) => (a.start_min ?? 0) - (b.start_min ?? 0));
  const laneEnds: number[] = [];
  const blocks: Block[] = [];
  for (const s of sorted) {
    if (s.start_min == null || s.end_min == null) continue;
    let lane = laneEnds.findIndex((end) => end <= s.start_min!);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = s.end_min;
    blocks.push({ ...s, lane });
  }
  return { blocks, lanes: Math.max(1, laneEnds.length) };
}

export function DayTimeGrid({
  rooms,
  sessions,
  isPast,
}: {
  rooms: GridRoom[];
  sessions: GridSession[];
  isPast: boolean;
}) {
  const timed = sessions.filter((s) => s.start_min != null && s.end_min != null);
  // 시간 축: 기본 9~22시, 세션이 밖에 있으면 그만큼 확장 (예: 모닝보카 8시)
  const minStart = Math.min(9 * 60, ...timed.map((s) => s.start_min!));
  const maxEnd = Math.max(22 * 60, ...timed.map((s) => s.end_min!));
  const axisFrom = Math.floor(minStart / 60) * 60;
  const axisTo = Math.ceil(maxEnd / 60) * 60;
  const span = axisTo - axisFrom;
  const hours = Array.from({ length: span / 60 }, (_, i) => axisFrom / 60 + i);
  const pos = (min: number) => ((min - axisFrom) / span) * 100;

  const byRoom = new Map<string, GridSession[]>();
  for (const s of timed) {
    (byRoom.get(s.classroom) ?? byRoom.set(s.classroom, []).get(s.classroom)!).push(s);
  }

  const hourLabel = (h: number) => (h <= 12 ? `${h}시` : `${h - 12}시`);

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
      <div className="min-w-[900px]">
        {/* 시간 눈금 헤더 */}
        <div className="flex border-b-2 border-zinc-300 bg-zinc-100">
          <div className="w-[150px] shrink-0 px-3 py-2 text-base font-semibold text-zinc-700">
            강의실
          </div>
          <div className="relative h-9 flex-1">
            {hours.map((h) => (
              <span
                key={h}
                className="absolute top-2 border-l border-zinc-300 pl-1 text-xs font-semibold text-zinc-500"
                style={{ left: `${pos(h * 60)}%` }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>
        </div>

        {/* 강의실 행 */}
        {rooms.map((room) => {
          const { blocks, lanes } = assignLanes(byRoom.get(room.classroom) ?? []);
          const cap = room.capacity ?? 0;
          return (
            <div key={room.classroom} className="flex border-b border-zinc-200 last:border-b-0">
              <div className="flex w-[150px] shrink-0 items-center justify-between gap-2 border-r border-zinc-200 bg-white px-3 py-2">
                <span className="text-sm font-semibold text-zinc-900">{room.room}</span>
                <span className="text-xs text-zinc-500">
                  {room.building} · {cap || "—"}석
                </span>
              </div>
              <div className="relative flex-1" style={{ height: `${lanes * 44}px` }}>
                {/* 시간 눈금선 */}
                {hours.map((h) => (
                  <span
                    key={h}
                    className="absolute inset-y-0 border-l border-zinc-100"
                    style={{ left: `${pos(h * 60)}%` }}
                  />
                ))}
                {/* 세션 블록 */}
                {blocks.map((b, i) => {
                  const fill = cap > 0 ? b.student_count / cap : null;
                  const attended = Math.max(0, b.student_count - b.absent_count);
                  const noTicket = b.student_count === 0;
                  const t = (m: number) =>
                    `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
                  return (
                    <div
                      key={i}
                      className={`absolute overflow-hidden rounded border border-white/60 px-1.5 py-0.5 text-[11px] leading-tight ${
                        noTicket ? "bg-violet-100 text-violet-800" : fillColor(fill)
                      }`}
                      style={{
                        left: `${pos(b.start_min!)}%`,
                        width: `${pos(b.end_min!) - pos(b.start_min!)}%`,
                        top: `${b.lane * 44 + 3}px`,
                        height: "38px",
                      }}
                      title={`${room.classroom} ${t(b.start_min!)}–${t(b.end_min!)}\n${b.class_name ?? ""}\n출석 ${isPast ? attended : "—"} / 등록 ${b.student_count} / 정원 ${cap || "—"} · 좌석 점유율 ${fmtPct(fill)}`}
                    >
                      <div className="truncate font-semibold">
                        {b.teacher_name ?? ""}
                        {noTicket ? "" : ` · ${b.student_count}명`}
                      </div>
                      <div className="truncate opacity-80">
                        {noTicket ? "등록없음" : `${fmtPct(fill)} 점유`}
                        {" · "}
                        {t(b.start_min!)}–{t(b.end_min!)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
