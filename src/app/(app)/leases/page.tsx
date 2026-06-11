import { getLeaseLines } from "@/lib/analytics/queries";
import { LeaseForm } from "./LeaseForm";

export const metadata = { title: "관 관리" };

export default async function LeasesPage() {
  const leases = await getLeaseLines();
  const buildings = new Set(leases.map((l) => l.building)).size;

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">관 관리</h1>
        <p className="mt-1 text-base text-zinc-600">
          관(임대차 계약 단위)별 면적·임대료·보증금·관리비·계약기간을 수정합니다. 저장 시 관별 수익성
          대시보드에 즉시 반영됩니다. · 관 {buildings}개 · 계약 {leases.length}건
        </p>
      </div>
      <LeaseForm leases={leases} />
    </main>
  );
}
