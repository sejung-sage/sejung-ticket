import { getBranch } from "@/lib/branch";
import { getTimetableStatus } from "@/lib/analytics/queries";
import { UploadForm } from "./UploadForm";
import { TimetableStatusView } from "./TimetableStatusView";

export const metadata = { title: "시간표 업로드" };

export default async function UploadPage() {
  const branch = await getBranch();
  const status = await getTimetableStatus(branch);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          시간표 업로드 <span className="text-zinc-400">·</span> {branch}
        </h1>
        <p className="mt-1 text-base text-zinc-600">
          {branch === "대치"
            ? "한글(.hwp/.hwpx) 시간표를 올리면 강의실 미기록 수업이 (교사+시간) 매칭으로 자동 채워집니다. 올린 날짜 ±14일 반영."
            : `${branch} 시간표 적재 현황입니다.`}
        </p>
      </div>

      {branch === "대치" ? (
        <UploadForm />
      ) : (
        <div className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          HWP 웹 업로드는 <b>대치</b> 시간표 전용입니다. {branch} 주간 시간표(XLSX)는 로컬에서{" "}
          <code className="rounded bg-amber-100 px-1">scripts/import-timetable-xlsx.mjs</code>로 적재하세요.
          아래 현황은 {branch} 적재분입니다.
        </div>
      )}

      <TimetableStatusView status={status} today={today} />

      {branch === "대치" && (
        <div className="mt-8 max-w-2xl rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          <b className="text-zinc-800">사용법</b>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>파일명은 <code className="rounded bg-zinc-100 px-1">요일 월_일.hwp</code> 형식 (예: 월 6_8.hwp)</li>
            <li>한 주치(월~일)를 한 번에 여러 개 올려도 됩니다</li>
            <li>같은 날짜를 다시 올리면 덮어씁니다(재적재)</li>
            <li>업로드 즉시 대시보드 반영</li>
          </ul>
        </div>
      )}
    </main>
  );
}
