import { getBuildingTrend } from "@/lib/analytics/queries";
import { BuildingTrendChart } from "./BuildingTrendChart";

export const metadata = { title: "가동률 추이" };
export const dynamic = "force-dynamic"; // DB 실시간 집계 — 빌드타임 정적화 방지

export default async function TrendPage() {
  const trend = await getBuildingTrend();

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">
        가동률 추이 <span className="text-zinc-400">·</span> 대치
      </h1>
      <p className="mt-1 text-base text-zinc-600">
        월별·관별 <b>좌석 점유율</b>(등록/정원)과 <b>가동률</b>(점유/운영) 추이. 시간표가 올라온
        월만 집계 — 과거 시간표가 적재될수록 그래프가 길어집니다.
      </p>
      <div className="mt-6">
        <BuildingTrendChart data={trend} />
      </div>
    </main>
  );
}
