"use client";

import { useActionState } from "react";
import type { Course, GridRoom } from "@/lib/analytics/types";
import { saveAssignments, type AssignState } from "./actions";

export function AssignForm({ courses, rooms }: { courses: Course[]; rooms: GridRoom[] }) {
  const [state, action, pending] = useActionState(saveAssignments, {} as AssignState);

  return (
    <form action={action}>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-sm font-medium text-zinc-600">
              <th className="px-4 py-2.5 font-medium">강좌</th>
              <th className="px-4 py-2.5 font-medium">교사</th>
              <th className="px-4 py-2.5 text-right font-medium">세션</th>
              <th className="px-4 py-2.5 font-medium">관측 강의실</th>
              <th className="px-4 py-2.5 font-medium">배정 강의실</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.class_name} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-4 py-2 font-medium text-zinc-800">{c.class_name}</td>
                <td className="px-4 py-2 text-zinc-500">{c.teacher_name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{c.sessions}</td>
                <td className="px-4 py-2 text-zinc-500">{c.observed_classroom ?? "—"}</td>
                <td className="px-4 py-2">
                  <select
                    name={`assign:${c.class_name}`}
                    defaultValue={c.assigned_classroom ?? ""}
                    className="w-40 rounded-md border border-zinc-300 px-2 py-1 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">(미지정)</option>
                    {rooms.map((r) => (
                      <option key={r.classroom} value={r.classroom}>
                        {r.classroom}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  강좌가 없습니다. 검색어를 바꿔보세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? "저장 중…" : "배정 저장"}
        </button>
        {state.saved != null && (
          <span className="text-sm text-emerald-700">{state.saved}건 반영됨</span>
        )}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}
