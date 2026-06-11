import { FilterBar } from "@/app/_components/FilterBar";
import { getBuildingPeriod, getFilterOptions, getLeaseLines } from "@/lib/analytics/queries";
import { BuildingFinanceTable } from "./BuildingFinanceTable";

export const metadata = { title: "관별 수익성" };

const todayISO = () => new Date().toISOString().slice(0, 10);
const firstDay = (ym: string) => `${ym}-01`;
function lastDay(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
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

  // 기본 기간: 최근 데이터 월의 1일~말일 (월 단위 기본).
  const endMonth = (maxData < today ? maxData : today).slice(0, 7);
  const to = sp.to || lastDay(endMonth);
  const from = sp.from || firstDay(endMonth);
  const building = sp.building || undefined;

  const [rows, leases] = await Promise.all([
    getBuildingPeriod({ from, to, building }),
    getLeaseLines(),
  ]);

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            관별 수익성 <span className="text-zinc-400">·</span> 대치
          </h1>
          <p className="mt-1 text-base text-zinc-600">
            관(임대차 계약 단위)별 <b>매출</b>과 <b>임대료</b>를 비교하고, <b>가동률</b>·<b>배정률</b>
            ·<b>출석율</b>을 함께 봅니다. 관을 누르면 계약(층)별 비용이 펼쳐집니다.
          </p>
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium text-emerald-700 select-none marker:content-none">
              <span className="transition group-open:rotate-90">▸</span> 지표 정의
            </summary>
            <dl className="mt-2 max-w-2xl space-y-1 text-sm text-zinc-600">
              <Def t="매출" d="Σ(강좌 회당금액 × 티켓수). 전체 발생매출 — 결제 여부·미래 예정분 포함." />
              <Def t="임대료" d="관별 월 임대료(VAT포함) 합을 선택 기간 일수만큼 환산(월=30.44일)." />
              <Def t="매출/임대" d="기간 매출 ÷ 기간 임대료. 임대료 1원당 매출 배수." />
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

      <div className="mt-6">
        <BuildingFinanceTable rows={rows} leases={leases} period={{ from, to }} />
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        대치 전용(타 지점은 추후 데이터 적재 후) · 입시관·학종관은 강의 usage가 없어 임대료만 표시.
      </p>
    </main>
  );
}

function Def({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 font-semibold text-zinc-800">{t}</dt>
      <dd className="text-zinc-600">{d}</dd>
    </div>
  );
}
