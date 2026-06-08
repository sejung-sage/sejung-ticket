import { FilterBar } from "@/app/_components/FilterBar";
import { fmtPct } from "@/lib/analytics/grid";
import { getFilterOptions, getRoomUtilization } from "@/lib/analytics/queries";

export const metadata = { title: "강의실별 가동률" };

const todayISO = () => new Date().toISOString().slice(0, 10);
function daysAgo(base: string, n: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; building?: string }>;
}) {
  const sp = await searchParams;
  const options = await getFilterOptions();
  const today = todayISO();
  const maxData = options.max_date ?? today;

  const to = sp.to || (today <= maxData ? today : maxData);
  const from = sp.from || daysAgo(to, 90);
  const building = sp.building || undefined;

  const rows = await getRoomUtilization({ from, to, building });
  const topUtil = rows.reduce((m, r) => Math.max(m, r.utilization ?? 0), 0) || 1;

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">강의실별 가동률</h1>
          <p className="mt-1 text-sm text-zinc-500">
            기간 내 강의실별 시간 가동률(점유/운영) · 가동률 높은 순
          </p>
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

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <th className="px-4 py-2.5 font-medium">강의실</th>
              <th className="px-4 py-2.5 font-medium">건물</th>
              <th className="px-4 py-2.5 font-medium">가동률</th>
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
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${((r.utilization ?? 0) / topUtil) * 100}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-zinc-700">{fmtPct(r.utilization)}</span>
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
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
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
