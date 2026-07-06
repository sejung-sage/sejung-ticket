import { getBranch } from "@/lib/branch";
import { getRoomsByBranch } from "@/lib/analytics/queries";
import { CapacityForm } from "./CapacityForm";

export const metadata = { title: "정원 관리" };

export default async function CapacityPage() {
  const branch = await getBranch();
  const rooms = await getRoomsByBranch(branch);
  const filled = rooms.filter((r) => r.capacity != null).length;

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          정원 관리 <span className="text-zinc-400">·</span> {branch}
        </h1>
        <p className="mt-1 text-base text-zinc-600">
          강의실 물리 정원(수용인원) 수정. 저장 시 좌석 점유율에 즉시 반영됩니다. · 입력{" "}
          {filled}/{rooms.length}
        </p>
      </div>
      {rooms.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
          이 분원에 등록된 강의실이 없습니다.
        </p>
      ) : (
        <CapacityForm rooms={rooms} branch={branch} />
      )}
    </main>
  );
}
