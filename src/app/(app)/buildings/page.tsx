import { FilterBar } from "@/app/_components/FilterBar";
import { fmtPct1 } from "@/lib/analytics/grid";
import { getBuildingPeriod, getFilterOptions } from "@/lib/analytics/queries";

export const metadata = { title: "관별 가동률" };

const todayISO = () => new Date().toISOString().slice(0, 10);
function monthsBefore(base: string, m: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString().slice(0, 10);
}

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; building?: string }>;
}) {
  const sp = await searchParams;
  const options = await getFilterOptions();
  const today = todayISO();
  const maxData = options.max_date ?? today;

  // 기본 기간: 데이터 끝(또는 오늘)에서 최근 1개월.
  const end = maxData < today ? maxData : today;
  const to = sp.to || end;
  const from = sp.from || monthsBefore(to, 1);
  const building = sp.building || undefined;

  const rows = await getBuildingPeriod({ from, to, building });
  const totalRooms = rows.reduce((s, r) => s + r.rooms, 0);

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            관별 가동률 <span className="text-zinc-400">·</span> 대치
          </h1>
          <p className="mt-1 text-base text-zinc-600">
            선택한 기간 동안 관(임대차 계약 단위)별 <b>가동률</b>·<b>배정률</b>·<b>출석율</b>.
            기간은 자유롭게 설정하세요.
          </p>
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium text-emerald-700 select-none marker:content-none">
              <span className="transition group-open:rotate-90">▸</span> 지표 정의
            </summary>
            <dl className="mt-2 max-w-2xl space-y-1 text-sm text-zinc-600">
              <Def t="가동률" d="시간 점유율 = Σ점유시간 ÷ Σ운영시간. 그 기간 수업이 있었던 강의실 기준." />
              <Def t="배정률" d="좌석 배정 = Σ(등록×수업시간) ÷ Σ(정원×수업시간). 물리 정원 대비 시간가중 점유." />
              <Def t="출석율" d="(등록−결석) ÷ 등록. 과거 날짜만 — 미래는 결석 미기록이라 제외." />
            </dl>
          </details>
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
            <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-sm font-medium text-zinc-600">
              <th className="px-4 py-2.5 font-medium">관</th>
              <th className="px-4 py-2.5 text-right font-medium">강의실</th>
              <th className="px-4 py-2.5 text-right font-medium">정원</th>
              <th className="px-4 py-2.5 font-medium">가동률</th>
              <th className="px-4 py-2.5 font-medium">배정률</th>
              <th className="px-4 py-2.5 font-medium">출석율</th>
              <th className="px-4 py-2.5 text-right font-medium">총 배정</th>
              <th className="px-4 py-2.5 text-right font-medium">세션</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.building} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-4 py-2.5 font-semibold text-zinc-800">{r.building}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{r.rooms}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                  {r.capacity ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Bar v={r.util} className="bg-emerald-500" />
                </td>
                <td className="px-4 py-2.5">
                  <Bar v={r.seat_fill} className="bg-sky-500" />
                </td>
                <td className="px-4 py-2.5">
                  <Bar v={r.attend_rate} className="bg-violet-500" />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">
                  {r.booked.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{r.sessions}</td>
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
        {from} ~ {to} · 관 {rows.length}개 · 강의실 {totalRooms}개 · 대치 전용(타 지점은 추후 데이터 적재 후)
      </p>
    </main>
  );
}

/** 비율 → 막대 + %. 100%를 가득으로(서로 다른 지표라 관끼리 절대 비교). */
function Bar({ v, className }: { v: number | null; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${className}`}
          style={{ width: `${Math.min(1, v ?? 0) * 100}%` }}
        />
      </div>
      <span className="tabular-nums font-medium text-zinc-700">{fmtPct1(v)}</span>
    </div>
  );
}

function Def({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold text-zinc-800">{t}</dt>
      <dd className="text-zinc-600">{d}</dd>
    </div>
  );
}
