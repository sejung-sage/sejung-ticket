"use client";

import { useState } from "react";
import { importParsed, type ImportItem, type ImportResult } from "./actions";

const DOW: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 7 };

// 파일명엔 연도가 없으므로(예: "금 12_19") 요일로 연도를 역추정한다.
// 같은 월/일이라도 요일이 일치하는 해는 최근 ±2년 내에서 유일.
function inferDate(targetDow: number, mm: string, dd: string): string | null {
  const thisYear = new Date().getFullYear();
  for (const y of [thisYear, thisYear - 1, thisYear + 1, thisYear - 2]) {
    const d = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
    const dow = ((d.getUTCDay() + 6) % 7) + 1; // 1=월..7=일
    // 잘못된 날짜(예: 2/29 비윤년)는 롤오버되므로 월/일 보존 확인
    if (d.getUTCMonth() + 1 === Number(mm) && d.getUTCDate() === Number(dd) && dow === targetDow) {
      return `${y}-${mm}-${dd}`;
    }
  }
  return null;
}

export function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setResults(null);
    const log: string[] = [];
    const items: ImportItem[] = [];

    for (const f of files) {
      const name = f.name.normalize("NFC");
      const m = name.match(/([월화수목금토일])\s*(\d+)_(\d+)/);
      if (!m) {
        log.push(`❌ ${name}: 파일명 형식 안 맞음 (예: "월 6_8.hwp")`);
        setLogs([...log]);
        continue;
      }
      const source_date = inferDate(DOW[m[1]], m[2].padStart(2, "0"), m[3].padStart(2, "0"));
      if (!source_date) {
        log.push(`❌ ${name}: 요일(${m[1]})에 맞는 연도를 못 찾음 — 파일명 날짜/요일 확인`);
        setLogs([...log]);
        continue;
      }
      try {
        const res = await fetch("/api/parse-timetable", { method: "POST", body: f });
        const j = await res.json();
        if (!res.ok || j.error) {
          log.push(`❌ ${name}: 파싱 실패 — ${j.error ?? res.status}`);
        } else {
          items.push({ source_date, weekday: DOW[m[1]], cells: j.cells });
          log.push(`✅ ${name} (${source_date}): ${j.cells.length}칸 파싱`);
        }
      } catch (e) {
        log.push(`❌ ${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      setLogs([...log]);
    }

    if (items.length) {
      log.push(`⏳ DB 적재 + 채움 갱신 중…`);
      setLogs([...log]);
      const { results, refreshed, refreshError } = await importParsed(items);
      setResults(results);
      log.push(refreshed ? `🔄 채움 갱신 완료` : `⚠️ 갱신 실패: ${refreshError}`);
      setLogs([...log]);
    }
    setBusy(false);
  }

  return (
    <div className="max-w-2xl">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center hover:border-emerald-400">
        <span className="text-3xl">⬆</span>
        <span className="text-base font-medium text-zinc-700">
          한글(.hwp/.hwpx) 시간표 파일 선택 (여러 개 가능)
        </span>
        <span className="text-sm text-zinc-500">파일명 형식: "월 6_8.hwp" (요일 + 월_일)</span>
        <input
          type="file"
          accept=".hwp,.hwpx"
          multiple
          className="hidden"
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setLogs([]);
            setResults(null);
          }}
        />
      </label>

      {files.length > 0 && (
        <div className="mt-3 text-sm text-zinc-600">
          선택됨: {files.map((f) => f.name.normalize("NFC")).join(", ")}
        </div>
      )}

      <button
        onClick={run}
        disabled={busy || files.length === 0}
        className="mt-4 rounded-lg bg-emerald-600 px-6 py-2.5 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "처리 중…" : `업로드 (${files.length}개)`}
      </button>

      {logs.length > 0 && (
        <pre className="mt-5 whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
          {logs.join("\n")}
        </pre>
      )}

      {results && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <b>적재 완료</b> — {results.reduce((s, r) => s + r.inserted, 0)}개 강좌 ·{" "}
          {results.length}개 날짜. 대시보드에 반영됐습니다.
        </div>
      )}
    </div>
  );
}
