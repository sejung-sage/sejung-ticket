import { FilterBar } from "@/app/_components/FilterBar";
import { SortControl } from "@/app/_components/SortControl";
import { fmtPct1 } from "@/lib/analytics/grid";
import { getFilterOptions, getRoomSessionUtil } from "@/lib/analytics/queries";
import type { RoomSessionUtil } from "@/lib/analytics/types";

export const metadata = { title: "강의실별 가동률" };

const todayISO = () => new Date().toISOString().slice(0, 10);
function daysAgo(base: string, n: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const SORT_OPTIONS = [
  { value: "m3_desc", label: "종합 충원율 높은순" },
  { value: "m3_asc", label: "종합 충원율 낮은순 (저활용)" },
  { value: "m1_desc", label: "세션 가동률 높은순" },
  { value: "m1_asc", label: "세션 가동률 낮은순" },
  { value: "m2_desc", label: "세션내 좌석충원 높은순" },
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
  const sort = sp.sort || "m3_desc";

  const fetched = await getRoomSessionUtil({ from, to, building });
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
          <h1 className="text-2xl font-bold tracking-tight">강의실별 가동률</h1>
          <p className="mt-1 text-base text-zinc-600">
            세션 기준 — 하루 3세션, 운영 세션 <b>평일 1(저녁) · 주말 3</b> (주 11)
          </p>
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium text-emerald-700 select-none marker:content-none">
              <span className="transition group-open:rotate-90">▸</span> 표 보는 법
            </summary>
            <dl className="mt-2 max-w-2xl space-y-1 text-sm text-zinc-600">
              <Def
                t="세션 가동률"
                d="사용 세션 ÷ 운영 세션. 운영 세션(평일 저녁 1, 주말 3, 주 11)을 얼마나 채웠나."
              />
              <Def
                t="좌석충원(세션내)"
                d="티켓 ÷ (사용 세션 × 정원). 수업이 열린 세션에서 좌석이 얼마나 찼나."
              />
              <Def
                t="종합 충원율"
                d="티켓 ÷ (운영 세션 × 정원) = 세션가동 × 좌석충원. 보유 좌석-세션 중 실제 몇 %가 찼나."
              />
              <Def t="사용/운영" d="실제 사용 세션 / 운영 가능 세션." />
              <Def t="티켓 / 정원" d="기간 등록 티켓 합 / 강의실 물리 정원." />
              <Def
                t="↳ 보강 등 예외"
                d="평일 비정규(보강 등) 세션은 가동률에서 제외(평일 사용 세션은 1로 상한). 원천에 '보강' 표시가 없어 자동 분류는 안 됨."
              />
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
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-sm font-medium text-zinc-600">
              <th className="px-4 py-2.5 font-medium">강의실</th>
              <th className="px-4 py-2.5 font-medium">건물</th>
              <th className="px-4 py-2.5 font-medium">세션 가동률</th>
              <th className="px-4 py-2.5 text-right font-medium">좌석충원(세션내)</th>
              <th className="px-4 py-2.5 font-medium">종합 충원율</th>
              <th className="px-4 py-2.5 text-right font-medium">사용/운영</th>
              <th className="px-4 py-2.5 text-right font-medium">티켓</th>
              <th className="px-4 py-2.5 text-right font-medium">정원</th>
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
                <td className="px-4 py-2.5 text-right tabular-nums">{r.tickets.toLocaleString()}</td>
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
