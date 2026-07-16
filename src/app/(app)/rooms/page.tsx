import { NoUsageNotice } from "@/app/_components/NoUsageNotice";
import { SortControl } from "@/app/_components/SortControl";
import { WeekBar } from "@/app/_components/WeekBar";
import { getBranch, hasUsage } from "@/lib/branch";
import { fmtPct1 } from "@/lib/analytics/grid";
import { getFilterOptions, getRoomSessionUtil } from "@/lib/analytics/queries";
import type { RoomSessionUtil } from "@/lib/analytics/types";

export const metadata = { title: "강의실별 가동률" };

const todayISO = () => new Date().toISOString().slice(0, 10);
function addDays(base: string, n: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 주어진 날짜가 속한 주의 월요일(YYYY-MM-DD). */
function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  const off = (d.getUTCDay() + 6) % 7; // 월=0 … 일=6
  d.setUTCDate(d.getUTCDate() - off);
  return d.toISOString().slice(0, 10);
}

const SORT_OPTIONS = [
  { value: "m3_desc", label: "종합 충원율 높은순" },
  { value: "m3_asc", label: "종합 충원율 낮은순 (저활용)" },
  { value: "m1_desc", label: "주간 강의실 가동률 높은순" },
  { value: "m1_asc", label: "주간 강의실 가동률 낮은순" },
  { value: "m2_desc", label: "주평균 좌석 점유율 높은순" },
];

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; building?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const branch = await getBranch();
  if (!hasUsage(branch)) {
    return (
      <main className="px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">
          강의실별 가동률 <span className="text-zinc-400">·</span> {branch}
        </h1>
        <NoUsageNotice branch={branch} />
      </main>
    );
  }
  const options = await getFilterOptions(branch);
  const today = todayISO();
  const maxData = options.max_date ?? today;

  // 주 단위: week 파라미터(주 내 아무 날짜)를 그 주 월~일로 스냅.
  const weekStart = mondayOf(sp.week || (today <= maxData ? today : maxData));
  const weekEnd = addDays(weekStart, 6);
  const from = weekStart;
  const to = weekEnd;
  const building = sp.building || undefined;
  const sort = sp.sort || "m3_desc";

  const fetched = await getRoomSessionUtil({ from, to, building, branch });
  const key = (sort.split("_")[0] as "m1" | "m2" | "m3") || "m3";
  const dir = sort.endsWith("asc") ? 1 : -1;
  const rows = [...fetched].sort((a, b) => ((a[key] ?? 0) - (b[key] ?? 0)) * dir);
  const top = (k: keyof RoomSessionUtil) =>
    rows.reduce((m, r) => Math.max(m, (r[k] as number) ?? 0), 0) || 1;
  const topM1 = top("m1");
  const topM3 = top("m3");

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">강의실별 가동률 <span className="text-zinc-400">·</span> 주간</h1>
          <p className="mt-1 text-base text-zinc-600">
            선택한 한 주(월~일) 기준 — 운영 세션 <b>학기중 평일 1(저녁) · 방학 평일 3 · 주말 3</b>
          </p>
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium text-emerald-700 select-none marker:content-none">
              <span className="transition group-open:rotate-90">▸</span> 표 보는 법
            </summary>
            <dl className="mt-2 max-w-2xl space-y-1 text-sm text-zinc-600">
              <Def
                t="주간 강의실 가동률"
                d="그 주에 강의실이 운영 가능한 세션 중 실제로 수업이 열린 비율. 사용 세션 ÷ 운영 세션."
              />
              <Def
                t="주평균 좌석 점유율"
                d="수업이 열린 세션에서 좌석이 평균 얼마나 찼나. 주평균 인원/세션 ÷ 정원."
              />
              <Def
                t="종합 충원율"
                d="보유 좌석 중 실제 몇 %가 찼나. = 주간 가동률 × 주평균 좌석 점유율. 티켓 ÷ (운영 세션 × 정원)."
              />
              <Def t="사용/운영" d="그 주 실제 사용 세션 / 운영 가능 세션." />
              <Def t="주평균 인원/세션" d="그 주 등록 티켓 합 ÷ 사용 세션 = 세션당 평균 학생수(정원과 같은 단위)." />
              <Def
                t="보강(예외)"
                d="학기중 평일 아침·오후 세션 = 보강으로 간주. 가동률·충원율 계산에서 제외하고 이 칸에 따로 표시(세션수·티켓수). 학기중 평일 정규는 저녁만, 방학 평일·주말은 3세션 모두 정규."
              />
            </dl>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WeekBar
            weekStart={weekStart}
            weekEnd={weekEnd}
            building={building}
            buildings={options.buildings}
            min={options.min_date ?? undefined}
            max={options.max_date ?? undefined}
          />
          <SortControl value={sort} options={SORT_OPTIONS} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-sm font-medium text-zinc-600">
              <th className="px-4 py-2.5 font-medium">강의실</th>
              <th className="px-4 py-2.5 font-medium">건물</th>
              <th className="px-4 py-2.5 font-medium">주간 강의실 가동률</th>
              <th className="px-4 py-2.5 text-right font-medium">주평균 좌석 점유율</th>
              <th className="px-4 py-2.5 font-medium">종합 충원율</th>
              <th className="px-4 py-2.5 text-right font-medium">사용/운영</th>
              <th className="px-4 py-2.5 text-right font-medium">주평균 인원/세션</th>
              <th className="px-4 py-2.5 text-right font-medium">정원</th>
              <th className="px-4 py-2.5 text-right font-medium">보강(예외)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.classroom} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-4 py-2.5 font-medium text-zinc-800">{r.classroom}</td>
                <td className="px-4 py-2.5 text-zinc-500">{r.building}</td>
                <td className="px-4 py-2.5">
                  <Bar v={r.m1} top={topM1} className="bg-emerald-400" />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{fmtPct1(r.m2)}</td>
                <td className="px-4 py-2.5">
                  <Bar v={r.m3} top={topM3} className="bg-emerald-600" bold />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {r.used_sessions}/{r.operating_sessions}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.used_sessions > 0 ? (r.tickets / r.used_sessions).toFixed(1) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {r.capacity ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">
                  {r.exception_sessions > 0
                    ? `${r.exception_sessions}세션 · ${r.exception_tickets}티켓`
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
                  해당 기간 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        {from} ~ {to} · 강의실 {rows.length}개
      </p>
    </main>
  );
}

function Bar({
  v,
  top,
  className,
  bold,
}: {
  v: number | null;
  top: number;
  className: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${className}`}
          style={{ width: `${((v ?? 0) / top) * 100}%` }}
        />
      </div>
      <span className={`tabular-nums ${bold ? "font-semibold text-zinc-800" : "text-zinc-600"}`}>
        {fmtPct1(v)}
      </span>
    </div>
  );
}

function Def({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 font-semibold text-zinc-800">{t}</dt>
      <dd className="text-zinc-600">{d}</dd>
    </div>
  );
}
