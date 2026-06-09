import { getVacationPeriods } from "@/lib/analytics/queries";
import { AddVacationForm } from "./AddVacationForm";
import { deleteVacation } from "./actions";

export const metadata = { title: "학기/방학 설정" };

export default async function TermPage() {
  const periods = await getVacationPeriods();

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">학기 · 방학 설정</h1>
        <p className="mt-1 text-base text-zinc-600">
          <b>방학 기간만</b> 등록하세요 (그 외 기간은 자동으로 학기중). 세션 운영 수가 달라집니다:
          <b> 학기중 평일 = 1세션(저녁)</b>, <b>방학 평일 = 3세션</b>, 주말은 항상 3세션.
        </p>
      </div>

      <div className="max-w-3xl">
        <AddVacationForm />

        <h2 className="mt-8 text-lg font-bold text-zinc-800">방학 기간 ({periods.length})</h2>
        {periods.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            등록된 방학이 없습니다. 전 기간이 학기중(평일 1세션)으로 계산됩니다.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-zinc-600">
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">시작</th>
                  <th className="px-4 py-2 font-medium">종료</th>
                  <th className="px-4 py-2 text-right font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100">
                    <td className="px-4 py-2 font-medium text-zinc-800">{p.label ?? "방학"}</td>
                    <td className="px-4 py-2 tabular-nums text-zinc-600">{p.from_date}</td>
                    <td className="px-4 py-2 tabular-nums text-zinc-600">{p.to_date}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteVacation}>
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          삭제
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
