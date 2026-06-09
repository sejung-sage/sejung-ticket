import { FilterBar } from "@/app/_components/FilterBar";
import { SortControl } from "@/app/_components/SortControl";
import { fmtPct } from "@/lib/analytics/grid";
import { getFilterOptions, getRoomUtilization } from "@/lib/analytics/queries";

export const metadata = { title: "강의실별 가동률" };

const todayISO = () => new Date().toISOString().slice(0, 10);
function daysAgo(base: string, n: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const SORT_OPTIONS = [
  { value: "all_desc", label: "전체 가동률 높은순" },
  { value: "all_asc", label: "전체 가동률 낮은순 (저활용)" },
  { value: "used_desc", label: "가동일 가동률 높은순" },
  { value: "used_asc", label: "가동일 가동률 낮은순" },
];

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; building?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const options = await getFilterOptions();
  const today = todayISO();
  const maxData = options.max_date ?? today;

  const to = sp.to || (today <= maxData ? today : maxData);
  const from = sp.from || daysAgo(to, 90);
  const building = sp.building || undefined;
  const sort = sp.sort || "all_desc";

  const fetched = await getRoomUtilization({ from, to, building });
  const key = sort.startsWith("all") ? "utilization_all" : "utilization";
  const dir = sort.endsWith("asc") ? 1 : -1;
  const rows = [...fetched].sort((a, b) => ((a[key] ?? 0) - (b[key] ?? 0)) * dir);
  const topUtil = rows.reduce((m, r) => Math.max(m, r.utilization ?? 0), 0) || 1;
  const topAll = rows.reduce((m, r) => Math.max(m, r.utilization_all ?? 0), 0) || 1;

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">강의실별 가동률</h1>
          <p className="mt-1 text-base text-zinc-600">
            <b>가동일</b> = 수업 있던 날만 분모 · <b>전체</b> = 기간 전체 운영일 분모(빈 날 포함)
          </p>
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium text-emerald-700 select-none marker:content-none">
              <span className="transition group-open:rotate-90">▸</span> 표 보는 법
            </summary>
            <dl className="mt-2 max-w-2xl space-y-1 text-sm text-zinc-600">
              <Def t="강의실 / 건물" d="강의실 이름과 소속 관." />
              <Def
                t="가동률 (가동일)"
                d="수업 있던 날만 기준. Σ점유시간 ÷ (수업한 날 × 운영시간). 쓸 땐 얼마나 알차게 썼나."
              />
              <Def
                t="가동률 (전체)"
                d="기간 전체 운영일 기준(빈 날 포함). 기간 내내 실제로 얼마나 쓰였나 — 저활용 강의실 찾기용."
              />
              <Def t="가동시간" d="기간 동안 그 강의실이 점유된 총 시간(h)." />
              <Def t="세션" d="기간 동안 그 강의실에서 열린 수업 횟수." />
              <Def t="운영일" d="그 강의실에 수업이 있었던 날 수." />
              <Def t="정원" d="물리 수용인원(정원 관리 탭에서 입력)." />
            </dl>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar
            from={from}
            to={to}
            building={building}
            buildings={options.buildings}
            min={options.min_date ?? undefined}
            max={options.max_date ?? undefined}
          />
          <SortControl value={sort} options={SORT_OPTIONS} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-sm font-medium text-zinc-600">
              <th className="px-4 py-2.5 font-medium">강의실</th>
              <th className="px-4 py-2.5 font-medium">건물</th>
              <th className="px-4 py-2.5 font-medium">가동률 (가동일)</th>
              <th className="px-4 py-2.5 font-medium">가동률 (전체)</th>
              <th className="px-4 py-2.5 text-right font-medium">가동시간</th>
              <th className="px-4 py-2.5 text-right font-medium">세션</th>
              <th className="px-4 py-2.5 text-right font-medium">운영일</th>
              <th className="px-4 py-2.5 text-right font-medium">정원</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.classroom} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-4 py-2.5 font-medium text-zinc-800">{r.classroom}</td>
                <td className="px-4 py-2.5 text-zinc-500">{r.building}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${((r.utilization ?? 0) / topUtil) * 100}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-zinc-600">{fmtPct(r.utilization)}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${((r.utilization_all ?? 0) / topAll) * 100}%` }}
                      />
                    </div>
                    <span className="font-semibold tabular-nums text-zinc-800">
                      {fmtPct(r.utilization_all)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.occupied_hours}h</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.sessions.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{r.days}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {r.capacity ?? "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">
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

function Def({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 font-semibold text-zinc-800">{t}</dt>
      <dd className="text-zinc-600">{d}</dd>
    </div>
  );
}
