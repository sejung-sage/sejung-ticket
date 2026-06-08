import { getDaechiRooms } from "@/lib/analytics/queries";
import { CapacityForm } from "./CapacityForm";

export const metadata = { title: "정원 관리" };

export default async function CapacityPage() {
  const rooms = await getDaechiRooms();
  const filled = rooms.filter((r) => r.capacity != null).length;

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">정원 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          강의실 물리 정원(수용인원) 수정. 저장 시 좌석 충원율에 즉시 반영됩니다. · 입력{" "}
          {filled}/{rooms.length}
        </p>
      </div>
      <CapacityForm rooms={rooms} />
    </main>
  );
}
