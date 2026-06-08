"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/** 기간(from~to) + 건물 필터. 변경 시 현재 경로의 searchParams 갱신. */
export function FilterBar({
  from,
  to,
  building,
  buildings,
  min,
  max,
}: {
  from: string;
  to: string;
  building?: string;
  buildings: string[];
  min?: string;
  max?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function update(patch: Record<string, string>) {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    start(() => router.push(`${pathname}?${p.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="date"
        value={from}
        min={min}
        max={max}
        onChange={(e) => update({ from: e.target.value })}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 tabular-nums focus:border-emerald-500 focus:outline-none"
      />
      <span className="text-zinc-400">~</span>
      <input
        type="date"
        value={to}
        min={min}
        max={max}
        onChange={(e) => update({ to: e.target.value })}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 tabular-nums focus:border-emerald-500 focus:outline-none"
      />
      <select
        value={building ?? ""}
        onChange={(e) => update({ building: e.target.value })}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
      >
        <option value="">전체 건물</option>
        {buildings.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-zinc-400">불러오는 중…</span>}
    </div>
  );
}
