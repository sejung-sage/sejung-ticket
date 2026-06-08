"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** 날짜 선택 → ?date= 로 이동(서버 재조회). 네이티브 캘린더 사용. */
export function DateFilter({ value, min, max }: { value: string; min?: string; max?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(next: string) {
    if (!next) return;
    startTransition(() => router.push(`/?date=${next}`));
  }

  function shift(days: number) {
    // UTC 기준으로 계산해야 시간대(KST) 때문에 하루 어긋나는 버그가 안 생김
    const d = new Date(value + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    go(d.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => shift(-1)}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
        aria-label="이전 날"
        disabled={pending}
      >
        ←
      </button>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => go(e.target.value)}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium tabular-nums focus:border-emerald-500 focus:outline-none"
      />
      <button
        onClick={() => shift(1)}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
        aria-label="다음 날"
        disabled={pending}
      >
        →
      </button>
      {pending && <span className="text-xs text-zinc-400">불러오는 중…</span>}
    </div>
  );
}
