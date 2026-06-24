"use client";

import { useMemo, useState } from "react";

const DOW = ["", "월", "화", "수", "목", "금", "토", "일"];

type Status = { source_date: string; weekday: number; cells: number; rooms: number };

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(base: string, n: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=일..6=토
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return ymd(d);
}
/** "2026-06" → 월 단위로 n 이동 */
function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** 그 달을 덮는 월~일 주 배열 */
function monthWeeks(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  const weeks: string[][] = [];
  let cur = mondayOf(`${month}-01`);
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  } while (cur <= lastDate);
  return weeks;
}

export function TimetableStatusView({ status, today }: { status: Status[]; today: string }) {
  const byDate = useMemo(() => new Map(status.map((s) => [s.source_date, s])), [status]);

  // 적재된 가장 최근 달(없으면 이번 달)을 기본으로
  const months = useMemo(
    () => Array.from(new Set(status.map((s) => s.source_date.slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [status],
  );
  const [month, setMonth] = useState(months[0] ?? today.slice(0, 7));
  const weeks = useMemo(() => monthWeeks(month), [month]);

  // 목록: 월별 그룹 (최신 달 먼저)
  const groups = useMemo(() => {
    const map = new Map<string, Status[]>();
    for (const s of [...status].sort((a, b) => b.source_date.localeCompare(a.source_date))) {
      const k = s.source_date.slice(0, 7);
      (map.get(k) ?? map.set(k, []).get(k)!).push(s);
    }
    return [...map.entries()];
  }, [status]);

  const [open, setOpen] = useState<Set<string>>(new Set(groups.length ? [groups[0][0]] : []));
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

  return (
    <>
      {/* 업로드 현황 달력 — 월 이동 */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-800">업로드 현황</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              className="rounded-md border border-zinc-200 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              ‹ 이전
            </button>
            <span className="min-w-[110px] text-center text-sm font-semibold tabular-nums text-zinc-800">
              {monthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className="rounded-md border border-zinc-200 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              다음 ›
            </button>
            <button
              type="button"
              onClick={() => setMonth(today.slice(0, 7))}
              className="ml-1 rounded-md border border-zinc-200 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              이번 달
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-500">숫자 = 강좌 칸수 · ○ 미적재 · 회색 글씨 = 미래</p>
        <div className="mt-3 inline-block overflow-hidden rounded-lg border border-zinc-200">
          <div className="grid grid-cols-7">
            {DOW.slice(1).map((d) => (
              <div
                key={d}
                className="border-b border-l border-zinc-200 bg-zinc-100 px-3 py-2 text-center text-sm font-semibold text-zinc-600 first:border-l-0"
              >
                {d}
              </div>
            ))}
            {weeks.flat().map((date, i) => {
              const s = byDate.get(date);
              const future = date > today;
              const outside = date.slice(0, 7) !== month;
              return (
                <div
                  key={date}
                  className={`flex min-w-[72px] flex-col items-center gap-0.5 border-b border-l border-zinc-100 px-2 py-2 ${
                    i % 7 === 0 ? "border-l-0" : ""
                  } ${s ? "bg-emerald-50" : ""} ${outside ? "opacity-40" : ""} ${
                    date === today ? "ring-2 ring-inset ring-emerald-500" : ""
                  }`}
                  title={s ? `${date} · 강좌 ${s.cells}` : date}
                >
                  <span className={`text-xs tabular-nums ${future ? "text-zinc-300" : "text-zinc-500"}`}>
                    {date.slice(8)}
                  </span>
                  {s ? (
                    <span className="text-sm font-semibold text-emerald-700">{s.cells}</span>
                  ) : (
                    <span className={`text-sm ${future ? "text-zinc-200" : "text-zinc-300"}`}>○</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 적재된 시간표 — 월별 그룹 */}
      <section className="mt-8 max-w-xl">
        <h2 className="text-lg font-bold text-zinc-800">적재된 시간표 ({status.length}일)</h2>
        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">아직 올린 시간표가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {groups.map(([m, rows]) => {
              const cells = rows.reduce((a, r) => a + r.cells, 0);
              const isOpen = open.has(m);
              return (
                <div key={m} className="overflow-hidden rounded-lg border border-zinc-200">
                  <button
                    type="button"
                    onClick={() => toggle(m)}
                    className="flex w-full items-center justify-between gap-3 bg-zinc-50 px-4 py-2.5 text-left hover:bg-zinc-100"
                  >
                    <span className="flex items-center gap-2 font-semibold text-zinc-800">
                      <span className={`text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                      {monthLabel(m)}
                      <span className="text-sm font-normal text-zinc-500">{rows.length}일</span>
                    </span>
                    <span className="text-sm tabular-nums text-zinc-500">강좌 {cells}</span>
                  </button>
                  {isOpen && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-y border-zinc-200 bg-white text-left text-zinc-500">
                          <th className="px-4 py-1.5 font-medium">날짜</th>
                          <th className="px-4 py-1.5 font-medium">요일</th>
                          <th className="px-4 py-1.5 text-right font-medium">강좌</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => (
                          <tr key={s.source_date} className="border-b border-zinc-100 last:border-b-0">
                            <td className="px-4 py-2 font-medium tabular-nums text-zinc-800">{s.source_date}</td>
                            <td className="px-4 py-2 text-zinc-500">{DOW[s.weekday]}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{s.cells}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
