import { DateFilter } from "@/app/_components/DateFilter";
import {
  getDaechiRooms,
  getDaySessions,
  getDefaultGridDate,
  getFilterOptions,
  getKpis,
} from "@/lib/analytics/queries";
import { buildGrid, fillColor, fmtPct } from "@/lib/analytics/grid";

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

  const [rooms, sessions, kpis] = await Promise.all([
    getDaechiRooms(),
    getDaySessions(date),
    getKpis({ from: date, to: date }),
  ]);

  const grid = buildGrid(rooms, sessions);

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            강의실 가동률 <span className="text-zinc-400">·</span> 대치
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            강의실 × 시간 — 각 칸 = 학생수/물리정원 · 좌석 충원율 (입시관·학종관 정원 미입력)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DateFilter
            value={date}
            min={options.min_date ?? undefined}
            max={options.max_date ?? undefined}
          />
          <span className="text-xs text-zinc-400">
            {date} ({dowLabel(date)}) {date > today && "· ⚠️ 미래 데이터(희박)"}
          </span>
        </div>
      </div>

      {/* 요약 칩 */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Chip label="세션" value={grid.totals.sessions.toLocaleString()} />
        <Chip label="학생(연인원)" value={grid.totals.students.toLocaleString()} />
        <Chip label="강좌 충원율" value={fmtPct(kpis.avg_fill_rate)} hint="학생/강좌정원" />
        <Chip label="평균 가동률" value={fmtPct(kpis.avg_utilization)} hint="점유/운영시간" />
        <Chip label="미납률" value={fmtPct(kpis.unpaid_rate)} />
      </div>

      {/* 범례 */}
      <div className="mt-6 flex items-center gap-3 text-xs text-zinc-500">
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
          <div
            className="grid min-w-max text-xs"
            style={{
              gridTemplateColumns: `150px repeat(${grid.hours.length}, minmax(76px, 1fr))`,
            }}
          >
            {/* 헤더 행 */}
            <div className="sticky left-0 z-10 border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-500">
              강의실
            </div>
            {grid.hours.map((h) => (
              <div
                key={h}
                className="border-b border-l border-zinc-200 bg-zinc-50 px-2 py-2 text-center font-medium text-zinc-500 tabular-nums"
              >
                {h}시
              </div>
            ))}

            {/* 강의실 행들 */}
            {grid.rows.map((row) => (
              <div key={row.room.classroom} className="contents">
                <div className="sticky left-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-100 bg-white px-3 py-2">
                  <span className="font-medium text-zinc-800">{row.room.room}</span>
                  <span className="text-[10px] text-zinc-400">{row.room.building}</span>
                </div>
                {row.cells.map((cell, i) => (
                  <div
                    key={i}
                    className={`border-b border-l border-zinc-100 px-1 py-1.5 text-center tabular-nums ${
                      cell ? fillColor(cell.fill) : "bg-white"
                    }`}
                    title={
                      cell
                        ? `${row.room.classroom} ${grid.hours[i]}시\n${cell.classNames.join(", ")}\n학생 ${cell.students}/${cell.capacity} · 완납 ${cell.paid} 미납 ${cell.unpaid}`
                        : undefined
                    }
                  >
                    {cell && (
                      <>
                        <div className="font-semibold leading-tight">
                          {cell.students}/{cell.capacity || "—"}
                        </div>
                        <div className="text-[10px] leading-tight opacity-90">
                          {fmtPct(cell.fill)}
                          {cell.unpaid > 0 && (
                            <span className="ml-1 rounded bg-black/15 px-1">미납 {cell.unpaid}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-400">
        강의실 {grid.totals.rooms}개 · 한 칸은 그 시간대에 열린 세션 합산. 시간 미파싱 세션은
        시간축에 배치되지 않음(요약엔 포함).
      </p>
    </main>
  );
}

function Chip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
      {hint && <div className="text-[10px] text-zinc-400">{hint}</div>}
    </div>
  );
}

function Legend({ className, t }: { className: string; t: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm ${className}`} />
      {t}
    </span>
  );
}
