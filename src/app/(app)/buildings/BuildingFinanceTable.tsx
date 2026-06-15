"use client";

import { Fragment, useState } from "react";
import { fmtPct1 } from "@/lib/analytics/grid";
import type { BuildingPeriod, LeaseLine } from "@/lib/analytics/types";

/** 금액 → 억/만 압축 표기. 정확한 원 단위는 title 툴팁으로. */
function won(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return v.toLocaleString();
}
const wonTitle = (v: number | null) => (v == null ? "" : `${v.toLocaleString()}원`);

/** 정원당 매출 = 매출 ÷ 총정원 (좌석 1개가 버는 기간 매출). */
function perSeatRevenue(r: BuildingPeriod): number | null {
  return r.revenue != null && r.capacity ? Math.round(r.revenue / r.capacity) : null;
}
/** 임대/매출 = 기간 임대료 ÷ 기간 매출 (매출에서 임대료가 차지하는 비중). 낮을수록 좋음. */
function rentShare(r: BuildingPeriod): number | null {
  return r.rent_period != null && r.revenue ? r.rent_period / r.revenue : null;
}
/** 임대/매출 비중 → 색상 배지. 낮을수록(임대료 부담 적을수록) 좋음. */
function rentShareClass(v: number | null): string {
  if (v == null) return "bg-zinc-100 text-zinc-400";
  if (v <= 0.25) return "bg-emerald-100 text-emerald-700";
  if (v <= 0.5) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export function BuildingFinanceTable({
  rows,
  leases,
  period,
}: {
  rows: BuildingPeriod[];
  leases: LeaseLine[];
  period: { from: string; to: string };
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (b: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });

  const byBuilding = new Map<string, LeaseLine[]>();
  for (const l of leases) {
    const arr = byBuilding.get(l.building);
    if (arr) arr.push(l);
    else byBuilding.set(l.building, [l]);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full min-w-[940px] text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-left text-sm font-medium text-zinc-600">
            <th className="px-4 py-2.5 font-medium">관</th>
            <th className="px-4 py-2.5 text-right font-medium">강의실</th>
            <th className="px-4 py-2.5 text-right font-medium">정원</th>
            <th className="px-4 py-2.5 text-right font-medium">평</th>
            <th className="px-4 py-2.5 font-medium">가동률</th>
            <th className="px-4 py-2.5 font-medium">좌석 점유율</th>
            <th className="px-4 py-2.5 font-medium">출석율</th>
            <th className="px-4 py-2.5 text-right font-medium">매출</th>
            <th className="px-4 py-2.5 text-right font-medium">정원당 매출</th>
            <th className="px-4 py-2.5 text-right font-medium">임대료</th>
            <th className="px-4 py-2.5 text-center font-medium">임대/매출</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lines = byBuilding.get(r.building) ?? [];
            const isOpen = open.has(r.building);
            return (
              <Fragment key={r.building}>
                <tr
                  className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/60"
                  onClick={() => lines.length > 0 && toggle(r.building)}
                >
                  <td className="px-4 py-2.5 font-semibold text-zinc-800">
                    <span className="inline-flex items-center gap-1.5">
                      {lines.length > 0 && (
                        <span
                          className={`text-zinc-400 transition ${isOpen ? "rotate-90" : ""}`}
                        >
                          ▸
                        </span>
                      )}
                      {r.building}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {r.rooms ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {r.capacity ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                    {r.area_py ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Bar v={r.util} className="bg-emerald-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <Bar v={r.seat_fill} className="bg-sky-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <Bar v={r.attend_rate} className="bg-violet-500" />
                  </td>
                  <td
                    className="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-800"
                    title={wonTitle(r.revenue)}
                  >
                    {won(r.revenue)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-zinc-700"
                    title={wonTitle(perSeatRevenue(r))}
                  >
                    {won(perSeatRevenue(r))}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-zinc-600"
                    title={wonTitle(r.rent_period)}
                  >
                    {won(r.rent_period)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${rentShareClass(rentShare(r))}`}
                    >
                      {rentShare(r) == null ? "—" : fmtPct1(rentShare(r))}
                    </span>
                  </td>
                </tr>
                {isOpen && lines.length > 0 && (
                  <tr className="border-b border-zinc-100 bg-zinc-50/40">
                    <td colSpan={11} className="px-4 py-3">
                      <LeaseDetail lines={lines} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="px-4 py-10 text-center text-zinc-400">
                해당 기간 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-zinc-400">
        {period.from} ~ {period.to} · 매출 = 강좌 회당금액 × 티켓수(전체 발생매출) · 정원당 매출 = 매출 ÷
        총정원 · 임대료 = 월 임대료 × 기간 개월수 · 임대/매출 = 임대료 ÷ 매출 · 관 행을 누르면 계약(층)별
        비용이 펼쳐집니다.
      </p>
    </div>
  );
}

function LeaseDetail({ lines }: { lines: LeaseLine[] }) {
  const sum = (k: "area_py" | "rent_monthly" | "deposit" | "maintenance") =>
    lines.reduce((s, l) => s + (l[k] ?? 0), 0);
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-full min-w-[680px] text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500">
            <th className="px-3 py-1.5 font-medium">계약(층)</th>
            <th className="px-3 py-1.5 font-medium">건물</th>
            <th className="px-3 py-1.5 text-right font-medium">평</th>
            <th className="px-3 py-1.5 text-right font-medium">월 임대료</th>
            <th className="px-3 py-1.5 text-right font-medium">보증금</th>
            <th className="px-3 py-1.5 text-right font-medium">관리비</th>
            <th className="px-3 py-1.5 font-medium">계약기간</th>
            <th className="px-3 py-1.5 font-medium">비고</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lease_label} className="border-b border-zinc-100 last:border-0">
              <td className="px-3 py-1.5 font-medium text-zinc-700">{l.lease_label}</td>
              <td className="px-3 py-1.5 text-zinc-500">{l.building_name ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                {l.area_py ?? "—"}
              </td>
              <td
                className="px-3 py-1.5 text-right tabular-nums text-zinc-600"
                title={wonTitle(l.rent_monthly)}
              >
                {won(l.rent_monthly)}
              </td>
              <td
                className="px-3 py-1.5 text-right tabular-nums text-zinc-600"
                title={wonTitle(l.deposit)}
              >
                {won(l.deposit)}
              </td>
              <td
                className="px-3 py-1.5 text-right tabular-nums text-zinc-500"
                title={wonTitle(l.maintenance)}
              >
                {won(l.maintenance)}
              </td>
              <td className="px-3 py-1.5 tabular-nums text-zinc-500">
                {l.lease_from && l.lease_to ? `${l.lease_from} ~ ${l.lease_to}` : "—"}
              </td>
              <td className="px-3 py-1.5 text-zinc-400">{l.note ?? ""}</td>
            </tr>
          ))}
          <tr className="border-t border-zinc-200 bg-zinc-50 font-medium text-zinc-700">
            <td className="px-3 py-1.5" colSpan={2}>
              합계 ({lines.length}건)
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{sum("area_py")}</td>
            <td className="px-3 py-1.5 text-right tabular-nums" title={wonTitle(sum("rent_monthly"))}>
              {won(sum("rent_monthly"))}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums" title={wonTitle(sum("deposit"))}>
              {won(sum("deposit"))}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums" title={wonTitle(sum("maintenance"))}>
              {won(sum("maintenance"))}
            </td>
            <td className="px-3 py-1.5" colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** 비율 → 막대 + %. 100%를 가득으로. */
function Bar({ v, className }: { v: number | null; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${className}`}
          style={{ width: `${Math.min(1, v ?? 0) * 100}%` }}
        />
      </div>
      <span className="tabular-nums font-medium text-zinc-700">{fmtPct1(v)}</span>
    </div>
  );
}
