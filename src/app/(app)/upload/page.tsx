import { getTimetableStatus } from "@/lib/analytics/queries";
import { UploadForm } from "./UploadForm";

export const metadata = { title: "시간표 업로드" };

const DOW = ["", "월", "화", "수", "목", "금", "토", "일"];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(base: string, n: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=일..6=토
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return ymd(d);
}

export default async function UploadPage() {
  const status = await getTimetableStatus();
  const byDate = new Map(status.map((s) => [s.source_date, s]));
  const today = new Date().toISOString().slice(0, 10);

  // 최근 5주(이번주 기준 3주 전 ~ 1주 후) 달력
  const start = addDays(mondayOf(today), -21);
  const weeks: string[][] = [];
  for (let w = 0; w < 5; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  }

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">시간표 업로드</h1>
        <p className="mt-1 text-base text-zinc-600">
          한글(.hwp) 시간표를 올리면 강의실 미기록 수업이 (교사+시간) 매칭으로 자동 채워집니다.
          올린 날짜 ±14일 반영.
        </p>
      </div>

      <UploadForm />

      {/* 업로드 현황 달력 */}
      <section className="mt-10">
        <h2 className="text-lg font-bold text-zinc-800">최근 업로드 현황</h2>
        <p className="mt-1 text-sm text-zinc-500">
          ✅ 적재됨(칸수) · ○ 아직 안 올림 · 회색 글씨 = 미래
        </p>
        <div className="mt-3 inline-block overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-7">
            {DOW.slice(1).map((d) => (
              <div
                key={d}
                className="border-b border-l border-zinc-200 bg-zinc-100 px-3 py-2 text-center text-sm font-semibold text-zinc-600 first:border-l-0"
              >
                {d}
              </div>
            ))}
            {weeks.flat().map((date, i) => {
              const s = byDate.get(date);
              const future = date > today;
              return (
                <div
                  key={date}
                  className={`flex min-w-[72px] flex-col items-center gap-0.5 border-b border-l border-zinc-100 px-2 py-2 ${
                    i % 7 === 0 ? "border-l-0" : ""
                  } ${date === today ? "bg-emerald-50" : ""}`}
                >
                  <span className={`text-xs tabular-nums ${future ? "text-zinc-300" : "text-zinc-500"}`}>
                    {date.slice(5)}
                  </span>
                  {s ? (
                    <span className="text-sm font-semibold text-emerald-700">✅ {s.cells}</span>
                  ) : (
                    <span className={`text-sm ${future ? "text-zinc-200" : "text-zinc-300"}`}>○</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 적재된 날짜 목록 */}
      <section className="mt-8 max-w-xl">
        <h2 className="text-lg font-bold text-zinc-800">적재된 시간표 ({status.length}일)</h2>
        {status.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">아직 올린 시간표가 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-zinc-600">
                  <th className="px-4 py-2 font-medium">날짜</th>
                  <th className="px-4 py-2 font-medium">요일</th>
                  <th className="px-4 py-2 text-right font-medium">강좌</th>
                  <th className="px-4 py-2 text-right font-medium">강의실 매칭</th>
                </tr>
              </thead>
              <tbody>
                {status.map((s) => (
                  <tr key={s.source_date} className="border-b border-zinc-100">
                    <td className="px-4 py-2 font-medium tabular-nums text-zinc-800">{s.source_date}</td>
                    <td className="px-4 py-2 text-zinc-500">{DOW[s.weekday]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.cells}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-500">
                      {s.rooms}/{s.cells}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 max-w-2xl rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        <b className="text-zinc-800">사용법</b>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>파일명은 <code className="rounded bg-zinc-100 px-1">요일 월_일.hwp</code> 형식 (예: 월 6_8.hwp)</li>
          <li>한 주치(월~일)를 한 번에 여러 개 올려도 됩니다</li>
          <li>같은 날짜를 다시 올리면 덮어씁니다(재적재)</li>
          <li>업로드 즉시 대시보드 반영</li>
        </ul>
      </div>
    </main>
  );
}
