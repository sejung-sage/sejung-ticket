import { UploadForm } from "./UploadForm";

export const metadata = { title: "시간표 업로드" };

export default function UploadPage() {
  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">시간표 업로드</h1>
        <p className="mt-1 text-base text-zinc-600">
          한글(.hwp) 시간표를 올리면 강의실 미기록(null) 수업이 (교사+시간) 매칭으로 자동 채워집니다.
          올린 날짜 ±14일이 반영돼요.
        </p>
      </div>
      <UploadForm />
      <div className="mt-8 max-w-2xl rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        <b className="text-zinc-800">사용법</b>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>파일명은 <code className="rounded bg-zinc-100 px-1">요일 월_일.hwp</code> 형식 (예: 월 6_8.hwp)</li>
          <li>한 주치(월~일)를 한 번에 여러 개 올려도 됩니다</li>
          <li>같은 날짜를 다시 올리면 덮어씁니다(재적재)</li>
          <li>업로드 즉시 대시보드 반영 (집계도 함께 갱신)</li>
        </ul>
      </div>
    </main>
  );
}
