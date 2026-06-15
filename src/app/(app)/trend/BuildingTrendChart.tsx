"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BuildingTrend } from "@/lib/analytics/types";

const METRICS = [
  { key: "seat_fill", label: "좌석 점유율" },
  { key: "util", label: "가동률" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

/** 관별 색상 — 추가 관이 생기면 순환. */
const COLORS = ["#059669", "#0284c7", "#7c3aed", "#d97706", "#dc2626", "#0d9488", "#db2777"];

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

export function BuildingTrendChart({ data }: { data: BuildingTrend[] }) {
  const [metric, setMetric] = useState<MetricKey>("seat_fill");

  const { rows, buildings } = useMemo(() => {
    const months = [...new Set(data.map((d) => d.month))].sort();
    const buildings = [...new Set(data.map((d) => d.building))];
    const rows = months.map((m) => {
      const row: Record<string, number | string | null> = { month: m };
      for (const b of buildings) {
        const rec = data.find((d) => d.month === m && d.building === b);
        row[b] = rec ? rec[metric] : null;
      }
      return row;
    });
    return { rows, buildings };
  }, [data, metric]);

  if (data.length === 0) {
    return (
      <p className="mt-10 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
        표시할 데이터가 없습니다. 이 추이는 <b>시간표 기반</b>이라, 시간표가 올라온 월만
        집계됩니다.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-md border px-2.5 py-1.5 text-sm ${
              metric === m.key
                ? "border-emerald-600 bg-emerald-600 font-medium text-white"
                : "border-zinc-300 hover:bg-zinc-100"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 13 }} stroke="#a1a1aa" />
            <YAxis
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 13 }}
              stroke="#a1a1aa"
              domain={[0, "auto"]}
            />
            <Tooltip
              formatter={(v) => pct(typeof v === "number" ? v : null)}
              labelStyle={{ fontWeight: 600 }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13 }}
            />
            <Legend />
            {buildings.map((b, i) => (
              <Line
                key={b}
                type="monotone"
                dataKey={b}
                name={b}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
