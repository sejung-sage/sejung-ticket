import { DateFilter } from "@/app/_components/DateFilter";
import {
  getDaechiRooms,
  getDaySessions,
  getDefaultGridDate,
  getFilterOptions,
  getKpis,
  getSeatUtil,
} from "@/lib/analytics/queries";
import { buildGrid, fillColor, fmtPct, TIME_BUCKETS } from "@/lib/analytics/grid";

export const metadata = { title: "강의실 가동률 — 강의실×시간" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dowLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const sp = await searchParams;
  const today = todayISO();
  const dateParam = typeof sp.date === "string" ? sp.date : undefined;

  const options = await getFilterOptions();
  const date = dateParam ?? (await getDefaultGridDate(today)) ?? options.max_date ?? today;

  const [rooms, sessions, kpis, seat] = await Promise.all([
    getDaechiRooms(),
    getDaySessions(date),
    getKpis({ from: date, to: date }),
    getSeatUtil({ from: date, to: date }),
  ]);

  const isPast = date < today;
  const grid = buildGrid(rooms, sessions, isPast);

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            강의실 가동률 <span className="text-zinc-400">·</span> 대치
          </h1>
          <p className="mt-1 text-base text-zinc-600">
            강의실 × 아침·오후·저녁 — 칸마다 <b>결제</b>(등록/정원)와 <b>출석</b>((등록−결석)/정원).
            출석은 과거만 · 미래는 빈칸
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DateFilter
            value={date}
            min={options.min_date ?? undefined}
            max={options.max_date ?? undefined}
          />
          <span className="text-sm font-medium text-zinc-600">
            {date} ({dowLabel(date)}) {date > today && "· ⚠️ 미래 데이터(희박)"}
          </span>
        </div>
      </div>

      {/* 요약 칩 */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Chip label="세션" value={grid.totals.sessions.toLocaleString()} />
        <Chip label="학생(연인원)" value={grid.totals.students.toLocaleString()} />
        <Chip label="평균 가동률" value={fmtPct(kpis.avg_utilization)} hint="시간: 점유/운영" />
        <Chip label="좌석 가동률" value={fmtPct(seat.m1_util)} hint="학생·시간/전체 좌석·시간" />
        <Chip label="좌석 충원율" value={fmtPct(seat.m2_util)} hint="학생·시간/수업 좌석·시간" />
        <Chip label="미납률" value={fmtPct(kpis.unpaid_rate)} />
      </div>

      {/* 범례 */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-medium text-zinc-600">
        <span>충원율</span>
        <Legend className="bg-emerald-100 text-emerald-800" t="~25%" />
        <Legend className="bg-emerald-300 text-emerald-950" t="25–50%" />
        <Legend className="bg-emerald-500 text-white" t="50–75%" />
        <Legend className="bg-emerald-600 text-white" t="75–100%" />
        <Legend className="bg-rose-500 text-white" t="초과" />
        <Legend className="bg-zinc-100 text-zinc-400" t="없음" />
      </div>

      {/* 그리드 */}
      {grid.totals.sessions === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
          {date} 에 집계된 세션이 없습니다. 날짜를 바꿔보세요.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
          <div className="grid min-w-max" style={{ gridTemplateColumns: "180px repeat(3, minmax(150px, 1fr))" }}>
            {/* 헤더 행 */}
            <div className="sticky left-0 z-10 border-b-2 border-zinc-300 bg-zinc-100 px-3 py-3 text-base font-semibold text-zinc-700">
              강의실
            </div>
            {TIME_BUCKETS.map((b) => (
              <div
                key={b}
                className="border-b-2 border-l border-zinc-300 bg-zinc-100 px-2 py-3 text-center text-lg font-bold text-zinc-700"
              >
                {b}
              </div>
            ))}

            {/* 강의실 행들 */}
            {grid.rows.map((row) => (
              <div key={row.room.classroom} className="contents">
                <div className="sticky left-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-3">
                  <span className="text-base font-semibold text-zinc-900">{row.room.room}</span>
                  <span className="text-xs text-zinc-500">{row.room.building}</span>
                </div>
                {row.cells.map((cell, i) => {
                  const attended = cell ? Math.max(0, cell.students - cell.absent) : 0;
                  return (
                    <div
                      key={i}
                      className={`border-b border-l border-zinc-200 px-2 py-2 ${
                        cell ? fillColor(cell.paidFill) : "bg-white"
                      }`}
                      title={
                        cell
                          ? `${row.room.classroom} ${TIME_BUCKETS[i]}\n${cell.classNames.join(", ")}\n등록 ${cell.students}/${cell.capacity} · 결석 ${cell.absent} · 미납 ${cell.unpaid}`
                          : undefined
                      }
                    >
                      {cell && (
                        <div className="flex flex-col gap-1 tabular-nums">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs opacity-80">결제</span>
                            <span>
                              <b className="text-base">{cell.students}/{cell.capacity || "—"}</b>
                              <b className="ml-1 text-sm">{fmtPct(cell.paidFill)}</b>
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between border-t border-black/10 pt-1">
                            <span className="text-xs opacity-80">출석</span>
                            <span>
                              {grid.isPast ? (
                                <>
                                  <b className="text-base">{attended}/{cell.capacity || "—"}</b>
                                  <b className="ml-1 text-sm">{fmtPct(cell.attendFill)}</b>
                                </>
                              ) : (
                                <span className="text-sm opacity-70">— 미래</span>
                              )}
                            </span>
                          </div>
                          {cell.unpaid > 0 && (
                            <div className="text-right text-xs">
                              <span className="rounded bg-black/15 px-1">미납 {cell.unpaid}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-sm text-zinc-500">
        강의실 {grid.totals.rooms}개 · 칸 = 그 타임 세션 합산 · 색=결제 충원율 · 출석=등록−결석(대치는
        결석만 기록) · 시간 미파싱 세션은 타임 배치 제외
      </p>
    </main>
  );
}

function Chip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="text-sm font-medium text-zinc-600">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-900">{value}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function Legend({ className, t }: { className: string; t: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-4 w-4 rounded-sm ${className}`} />
      {t}
    </span>
  );
}
