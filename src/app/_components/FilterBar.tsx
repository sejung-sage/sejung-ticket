"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { LoadingOverlay } from "./LoadingOverlay";

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

  // 기간 프리셋 (UTC 기준 계산)
  const todayStr = new Date().toISOString().slice(0, 10);
  const end = max && max < todayStr ? max : todayStr;
  function monthsBefore(base: string, m: number) {
    const d = new Date(base + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - m);
    return d.toISOString().slice(0, 10);
  }
  const presets: { label: string; from: string; to: string }[] = [
    { label: "1개월", from: monthsBefore(end, 1), to: end },
    { label: "3개월", from: monthsBefore(end, 3), to: end },
    { label: "6개월", from: monthsBefore(end, 6), to: end },
    ...(min && max ? [{ label: "전체", from: min, to: max }] : []),
  ];
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.label;

  return (
    <>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div className="flex items-center gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => update({ from: p.from, to: p.to })}
            className={`rounded-md border px-2.5 py-1.5 ${
              activePreset === p.label
                ? "border-emerald-600 bg-emerald-600 font-medium text-white"
                : "border-zinc-300 hover:bg-zinc-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="mx-1 h-5 w-px bg-zinc-200" />
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
    </div>
    <LoadingOverlay show={pending} />
    </>
  );
}
