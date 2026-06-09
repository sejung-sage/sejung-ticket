"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** 주 단위 선택 바: 이전/다음 주 + 날짜로 점프(그 주 월요일로 스냅) + 건물 필터. */
export function WeekBar({
  weekStart,
  weekEnd,
  building,
  buildings,
  min,
  max,
}: {
  weekStart: string; // 월요일 (YYYY-MM-DD)
  weekEnd: string; // 일요일
  building?: string;
  buildings: string[];
  min?: string;
  max?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function push(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`/rooms?${p.toString()}`);
  }

  function shift(n: number) {
    const d = new Date(weekStart + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7 * n);
    push({ week: d.toISOString().slice(0, 10) });
  }

  const md = (s: string) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const prevDisabled = min ? weekStart <= min : false;
  const nextDisabled = max ? weekEnd >= max : false;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-zinc-300 bg-white">
        <button
          onClick={() => shift(-1)}
          disabled={prevDisabled}
          className="px-3 py-1.5 text-lg font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
          aria-label="이전 주"
        >
          ‹
        </button>
        <span className="min-w-[140px] px-2 text-center text-sm font-semibold tabular-nums text-zinc-800">
          {md(weekStart)}(월) ~ {md(weekEnd)}(일)
        </span>
        <button
          onClick={() => shift(1)}
          disabled={nextDisabled}
          className="px-3 py-1.5 text-lg font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
          aria-label="다음 주"
        >
          ›
        </button>
      </div>
      <input
        type="date"
        value={weekStart}
        min={min}
        max={max}
        onChange={(e) => e.target.value && push({ week: e.target.value })}
        title="날짜를 고르면 그 주로 이동"
        className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none"
      />
      <select
        value={building ?? ""}
        onChange={(e) => push({ building: e.target.value || undefined })}
        className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
      >
        <option value="">전체 건물</option>
        {buildings.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </div>
  );
}
