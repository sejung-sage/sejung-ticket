import { FilterBar } from "@/app/_components/FilterBar";
import { fmtPct } from "@/lib/analytics/grid";
import { getFilterOptions, getUtilizationTrend } from "@/lib/analytics/queries";

export const metadata = { title: "월별 가동률" };

const todayISO = () => new Date().toISOString().slice(0, 10);
const ymLabel = (d: string) => d.slice(0, 7);

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; building?: string }>;
}) {
  const sp = await searchParams;
  const options = await getFilterOptions();
  const today = todayISO();
  const maxData = options.max_date ?? today;

  const to = sp.to || (today <= maxData ? today : maxData);
  const from = sp.from || options.min_date || daysAgo(to, 365);
  const building = sp.building || undefined;

  const points = await getUtilizationTrend({ from, to, building }, "month");
  const top = points.reduce((m, p) => Math.max(m, p.utilization ?? 0), 0) || 1;

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">월별 가동률</h1>
          <p className="mt-1 text-sm text-zinc-500">월 단위 전체 가동률 추이 (점유/운영시간)</p>
        </div>
        <FilterBar
          from={from}
          to={to}
          building={building}
          buildings={options.buildings}
          min={options.min_date ?? undefined}
          max={options.max_date ?? undefined}
        />
      </div>

      <div className="mt-6 flex flex-col gap-1.5">
        {points.map((p) => {
          const future = p.bucket > today;
          return (
            <div key={p.bucket} className="flex items-center gap-3">
              <div className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                {ymLabel(p.bucket)}
              </div>
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-zinc-100">
                <div
                  className={`h-full ${future ? "bg-emerald-300" : "bg-emerald-500"}`}
                  style={{ width: `${((p.utilization ?? 0) / top) * 100}%` }}
                />
                <div className="absolute inset-y-0 left-2 flex items-center text-xs font-medium tabular-nums text-zinc-700">
                  {fmtPct(p.utilization)}
                  {future && <span className="ml-1 text-zinc-400">(미래)</span>}
                </div>
              </div>
              <div className="w-20 shrink-0 text-right text-xs tabular-nums text-zinc-400">
                {Math.round(p.occupied_min / 60).toLocaleString()}h
              </div>
            </div>
          );
        })}
        {points.length === 0 && (
          <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400">
            해당 기간 데이터가 없습니다.
          </p>
        )}
      </div>
      <p className="mt-4 text-xs text-zinc-400">
        {from} ~ {to} · {points.length}개월 · 막대 길이 = 최고 월 대비 상대값
      </p>
    </main>
  );
}

function daysAgo(base: string, n: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
