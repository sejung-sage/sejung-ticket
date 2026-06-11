"use client";

import { useActionState } from "react";
import type { LeaseLine } from "@/lib/analytics/types";
import { updateLeases, type LeaseState } from "./actions";

const comma = (v: number | null) => (v == null ? "" : v.toLocaleString());

export function LeaseForm({ leases }: { leases: LeaseLine[] }) {
  const [state, action, pending] = useActionState(updateLeases, {} as LeaseState);

  // 건물(관)별 그룹 — 평탄 인덱스로 폼 키를 부여.
  const groups = new Map<string, { line: LeaseLine; idx: number }[]>();
  leases.forEach((line, idx) => {
    if (!groups.has(line.building)) groups.set(line.building, []);
    groups.get(line.building)!.push({ line, idx });
  });

  return (
    <form action={action}>
      <div className="grid grid-cols-1 gap-5">
        {[...groups.entries()].map(([building, list]) => (
          <div key={building} className="overflow-x-auto rounded-lg border border-zinc-200">
            <div className="flex items-baseline gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2">
              <span className="text-sm font-semibold text-zinc-800">{building}</span>
              <span className="text-xs text-zinc-400">{list[0]?.line.building_name ?? ""}</span>
            </div>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                  <th className="px-4 py-1.5 font-medium">계약(층)</th>
                  <th className="px-3 py-1.5 text-right font-medium">평</th>
                  <th className="px-3 py-1.5 text-right font-medium">월 임대료(원)</th>
                  <th className="px-3 py-1.5 text-right font-medium">보증금(원)</th>
                  <th className="px-3 py-1.5 text-right font-medium">관리비(원)</th>
                  <th className="px-3 py-1.5 font-medium">계약 시작</th>
                  <th className="px-3 py-1.5 font-medium">계약 종료</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ line, idx }) => (
                  <tr key={idx} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-1.5 font-medium whitespace-nowrap text-zinc-700">
                      {line.lease_label}
                      <input type="hidden" name={`bld:${idx}`} value={line.building} />
                      <input type="hidden" name={`lbl:${idx}`} value={line.lease_label} />
                      {line.note && (
                        <span className="ml-1 text-xs font-normal text-zinc-400">({line.note})</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        name={`area:${idx}`}
                        type="number"
                        min={0}
                        defaultValue={line.area_py ?? ""}
                        className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Money name={`rent:${idx}`} value={line.rent_monthly} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Money name={`deposit:${idx}`} value={line.deposit} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Money name={`maint:${idx}`} value={line.maintenance} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        name={`from:${idx}`}
                        type="date"
                        defaultValue={line.lease_from ?? ""}
                        className="rounded-md border border-zinc-300 px-2 py-1 tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        name={`to:${idx}`}
                        type="date"
                        defaultValue={line.lease_to ?? ""}
                        className="rounded-md border border-zinc-300 px-2 py-1 tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 mt-6 flex items-center gap-3 bg-white/90 py-3 backdrop-blur">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? "저장 중…" : "임대 정보 저장"}
        </button>
        {state.saved != null && (
          <span className="text-sm text-emerald-700">
            {state.saved === 0 ? "변경 사항 없음" : `${state.saved}건 저장됨`}
          </span>
        )}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

/** 금액 입력: 콤마 표기 허용(저장 시 서버가 콤마 제거). */
function Money({ name, value }: { name: string; value: number | null }) {
  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      defaultValue={comma(value)}
      placeholder="미정"
      className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums focus:border-emerald-500 focus:outline-none"
    />
  );
}
