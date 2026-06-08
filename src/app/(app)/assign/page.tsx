import { getCourses, getDaechiRooms } from "@/lib/analytics/queries";
import { AssignForm } from "./AssignForm";
import { SearchBox } from "./SearchBox";

export const metadata = { title: "강좌–강의실 배정" };

export default async function AssignPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q || undefined;

  const [courses, rooms] = await Promise.all([getCourses(q, 100), getDaechiRooms()]);

  return (
    <main className="px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">강좌–강의실 배정</h1>
          <p className="mt-1 text-sm text-zinc-500">
            원천엔 강좌별 강의실이 항상 엮여 있지 않음. 강좌에 강의실을 수동 지정(보정).
            “관측 강의실” = 데이터상 최빈값.
          </p>
        </div>
        <SearchBox defaultValue={q} />
      </div>

      <p className="mt-4 mb-3 text-xs text-zinc-400">
        세션 많은 순 최대 100개{q ? ` · "${q}" 검색` : ""} · {courses.length}개 강좌
      </p>

      <AssignForm courses={courses} rooms={rooms} />
    </main>
  );
}
