"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { LoadingOverlay } from "./LoadingOverlay";

/** 기간(from~to) + 건물 필터. 변경 시 현재 경로의 searchParams 갱신. */
export function FilterBar({
  from,
  to,
  branch,
  branches,
  building,
  buildings,
  min,
  max,
}: {
  from: string;
  to: string;
  branch?: string;
  branches?: string[];
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

  // 월 단위 계산 (YYYY-MM ↔ 1일/말일). 전부 UTC 기준.
  const firstDay = (ym: string) => `${ym}-01`;
  function lastDay(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // 다음달 0일 = 이번달 말일
  }
  function ymOffset(ym: string, months: number) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
  }

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const minMonth = min?.slice(0, 7);
  const maxMonth = max?.slice(0, 7);

  // 기간 프리셋 (최근 데이터 월 기준, 월 단위)
  const todayMonth = new Date().toISOString().slice(0, 7);
  const endM = maxMonth && maxMonth < todayMonth ? maxMonth : todayMonth;
  const presets: { label: string; from: string; to: string }[] = [
    { label: "1개월", from: firstDay(endM), to: lastDay(endM) },
    { label: "3개월", from: firstDay(ymOffset(endM, -2)), to: lastDay(endM) },
    { label: "6개월", from: firstDay(ymOffset(endM, -5)), to: lastDay(endM) },
    ...(minMonth && maxMonth
      ? [{ label: "전체", from: firstDay(minMonth), to: lastDay(maxMonth) }]
      : []),
  ];
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.label;

  // 시작/종료 월 선택 → 1일~말일로 환산. 역전되면 반대쪽도 맞춰줌.
  function setFromMonth(ym: string) {
    if (!ym) return;
    update(ym > toMonth ? { from: firstDay(ym), to: lastDay(ym) } : { from: firstDay(ym) });
  }
  function setToMonth(ym: string) {
    if (!ym) return;
    update(ym < fromMonth ? { from: firstDay(ym), to: lastDay(ym) } : { to: lastDay(ym) });
  }

  return (
    <>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {branches && branches.length > 1 && (
        <>
          <select
            value={branch ?? ""}
            onChange={(e) => update({ branch: e.target.value, building: "" })}
            className="rounded-md border border-zinc-300 px-2.5 py-1.5 font-medium focus:border-emerald-500 focus:outline-none"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <span className="mx-1 h-5 w-px bg-zinc-200" />
        </>
      )}
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
        type="month"
        value={fromMonth}
        min={minMonth}
        max={maxMonth}
        onChange={(e) => setFromMonth(e.target.value)}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 tabular-nums focus:border-emerald-500 focus:outline-none"
      />
      <span className="text-zinc-400">~</span>
      <input
        type="month"
        value={toMonth}
        min={minMonth}
        max={maxMonth}
        onChange={(e) => setToMonth(e.target.value)}
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
