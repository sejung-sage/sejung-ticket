"use client";

import { useActionState } from "react";
import type { GridRoom } from "@/lib/analytics/types";
import { updateCapacities, type CapacityState } from "./actions";

export function CapacityForm({ rooms, branch }: { rooms: GridRoom[]; branch: string }) {
  const [state, action, pending] = useActionState(updateCapacities, {} as CapacityState);

  // 건물별 그룹
  const groups = new Map<string, GridRoom[]>();
  for (const r of rooms) {
    if (!groups.has(r.building)) groups.set(r.building, []);
    groups.get(r.building)!.push(r);
  }

  return (
    <form action={action}>
      <input type="hidden" name="branch" value={branch} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].map(([building, list]) => (
          <div key={building} className="rounded-lg border border-zinc-200">
            <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700">
              {building}
            </div>
            <div className="divide-y divide-zinc-100">
              {list.map((r) => (
                <label
                  key={r.classroom}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                >
                  <span className="text-zinc-700">{r.room}</span>
                  <input
                    name={`cap:${r.classroom}`}
                    type="number"
                    min={0}
                    defaultValue={r.capacity ?? ""}
                    placeholder="미정"
                    className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? "저장 중…" : "정원 저장"}
        </button>
        {state.saved != null && (
          <span className="text-sm text-emerald-700">{state.saved}개 강의실 저장됨</span>
        )}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}
