import { DateFilter } from "@/app/_components/DateFilter";
import {
  getDaechiRooms,
  getDaySessions,
  getDefaultGridDate,
  getFilterOptions,
  getKpis,
  getSeatUtil,
  getDayOpSessions,
  getVacationPeriods,
} from "@/lib/analytics/queries";
import { buildGrid, fillColor, fmtPct, fmtPct1, TIME_BUCKETS } from "@/lib/analytics/grid";

export const metadata = { title: "강의실 가동률 — 강의실×시간" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dowLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

/** 등록(티켓) 없는 세션의 종류 라벨 (시간표 강좌명에서 추출). */
function sessionTag(names: string[]): string {
  const s = names.join(" ");
  if (s.includes("클리닉")) return "클리닉";
  if (s.includes("보강")) return "보강";
  if (s.includes("설명회")) return "설명회";
  if (s.includes("자료")) return "자료확인";
  if (/test|테스트/i.test(s)) return "테스트";
  return "수업";
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

  const [rooms, sessions, kpis, seat, opPerRoom, vacations] = await Promise.all([
    getDaechiRooms(),
    getDaySessions(date),
    getKpis({ from: date, to: date }),
    getSeatUtil({ from: date, to: date }),
    getDayOpSessions(date),
    getVacationPeriods(),
  ]);
  const isVacation = vacations.some((v) => date >= v.from_date && date <= v.to_date);

  const isPast = date < today;
  const grid = buildGrid(rooms, sessions, isPast);

  // 세션 모델: 운영 세션 = 주말 3·방학평일 3·학기중평일 1(저녁). 학기중 평일 비저녁(보강)은 제외.
  const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0=일,6=토
  const isWeekend = dow === 0 || dow === 6;
  const allBuckets = opPerRoom === 3; // 주말 또는 방학 → 3세션 모두 정규
  const totalSessions = grid.totals.rooms * opPerRoom;
  const usedSessions = grid.rows.reduce(
    (sum, row) =>
      sum + (allBuckets ? row.cells.filter(Boolean).length : row.cells[2] ? 1 : 0),
    0,
  );
  const opHint = isWeekend ? "주말 3세션" : allBuckets ? "방학 3세션" : "학기중 저녁 1세션";
  const termLabel = isVacation ? "방학" : "학기중";

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            강의실 가동률 <span className="text-zinc-400">·</span> 대치
          </h1>
          <p className="mt-1 text-base text-zinc-600">
            강의실 × 아침·오후·저녁 — 칸마다 <b>가동좌석수</b>(등록/정원)와 <b>출석</b>((등록−결석)/등록).
            출석은 과거만 · 미래는 빈칸
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DateFilter
            value={date}
            min={options.min_date ?? undefined}
            max={options.max_date ?? undefined}
          />
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isVacation ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {isVacation ? "❄ 방학" : "📚 학기중"}
            </span>
            {date} ({dowLabel(date)}) {date > today && "· ⚠️ 미래 데이터(희박)"}
          </span>
        </div>
      </div>

      {/* 요약 칩 */}
      <div className="mt-5 grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Chip
          label="세션 (사용/전체)"
          value={`${usedSessions}/${totalSessions}`}
          hint={opHint}
          def={`오늘 강의실에서 수업이 열릴 수 있는 시간대(=세션)는 모두 ${totalSessions}개인데, 그중 실제로 쓴 시간대가 ${usedSessions}개라는 뜻입니다. 운영 세션 = 강의실 ${grid.totals.rooms}개 × ${opPerRoom}(${allBuckets ? "아침·오후·저녁 모두" : "저녁만"}). ${termLabel} 기준이며, 학기중 평일은 저녁 1세션(낮에 하는 보강은 제외), 방학·주말은 3세션입니다. 방학 기간은 '학기/방학 설정' 탭에서 지정합니다.`}
        />
        <Chip
          label="학생(티켓기준)"
          value={grid.totals.students.toLocaleString()}
          def="수업별 등록 학생수의 총합(= 티켓수). 한 학생이 N과목 들으면 N명으로 셉니다 — 실제 사람 수(실인원)와 다릅니다."
        />
        <Chip
          label="평균 가동률"
          value={fmtPct1(kpis.avg_utilization)}
          hint="시간: 점유/운영"
          def="Σ점유시간 ÷ Σ운영시간. 강의실이 운영시간(평일/주말 설정) 중 시간적으로 얼마나 쓰였나. 그날 수업이 있었던 강의실 기준입니다."
        />
        <Chip
          label="좌석 충원율"
          value={fmtPct1(seat.m2_util)}
          hint="세션내: 학생/정원"
          def="Σ(학생수×수업시간) ÷ (정원 × 실제 수업시간). 수업이 실제로 열린 세션에서 좌석이 평균 얼마나 찼나. 물리 정원 기준 — 칸의 가동좌석수를 하루 전체로 묶은 값입니다."
        />
        <Chip
          label="미납률"
          value={fmtPct1(kpis.unpaid_rate)}
          def="미납(결제전) 학생수 ÷ 전체 학생수. 등록했지만 아직 결제 안 한 비율."
        />
      </div>

      {/* 범례 */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-medium text-zinc-600">
        <span>충원율</span>
        <Legend className="bg-emerald-100 text-emerald-800" t="~25%" />
        <Legend className="bg-emerald-300 text-emerald-950" t="25–50%" />
        <Legend className="bg-emerald-500 text-white" t="50–75%" />
        <Legend className="bg-emerald-600 text-white" t="75–100%" />
        <Legend className="bg-rose-500 text-white" t="초과" />
        <Legend className="bg-zinc-100 text-zinc-400" t="없음(수업X)" />
        <Legend className="bg-violet-200" t="클리닉/보강(등록없음)" />
      </div>

      {/* 그리드 */}
      {grid.totals.sessions === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
          {date} 시간표가 업로드되지 않았습니다. 이 대시보드는 <b>시간표 기반</b>이라,
          시간표를 올린 날짜만 표시됩니다 — <b>시간표 업로드</b> 탭에서 올려주세요.
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
                        cell ? (cell.students === 0 ? "bg-violet-50" : fillColor(cell.paidFill)) : "bg-white"
                      }`}
                      title={
                        cell
                          ? `${row.room.classroom} ${TIME_BUCKETS[i]}\n${cell.classNames.join(", ")}\n등록 ${cell.students}/${cell.capacity} · 결석 ${cell.absent} · 미납 ${cell.unpaid}`
                          : undefined
                      }
                    >
                      {cell && cell.students === 0 && (
                        <div className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-center">
                          <span className="rounded bg-violet-200 px-2 py-0.5 text-sm font-bold text-violet-800">
                            {sessionTag(cell.classNames)}
                          </span>
                          <span className="text-xs text-violet-500">등록 없음</span>
                        </div>
                      )}
                      {cell && cell.students > 0 && (
                        <div className="flex flex-col gap-1 tabular-nums">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs opacity-80">가동좌석수</span>
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
                                  <b className="text-base">{attended}/{cell.students}</b>
                                  <b className="ml-1 text-sm">{fmtPct(cell.attendFill)}</b>
                                </>
                              ) : (
                                <span className="text-sm opacity-70">—</span>
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
        강의실 {grid.totals.rooms}개 · 칸 = 그 타임 세션 합산 · 색=가동좌석수(등록/정원) ·
        출석=(등록−결석)/등록(대치는 결석만 기록) · 시간 미파싱 세션은 타임 배치 제외
      </p>
    </main>
  );
}

function Chip({
  label,
  value,
  hint,
  def,
}: {
  label: string;
  value: string;
  hint?: string;
  def?: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="text-sm font-medium text-zinc-600">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-900">{value}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      {def && (
        <details className="group mt-auto pt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-emerald-700 select-none marker:content-none">
            <span className="transition group-open:rotate-90">▸</span> 정의
          </summary>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{def}</p>
        </details>
      )}
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
