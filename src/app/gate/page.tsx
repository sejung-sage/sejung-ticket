import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PasscodeForm } from "./PasscodeForm";

export const metadata = { title: "입장 — 세정학원 강의실 대시보드" };

// 장식용 블러 배경 셀 색 (실데이터 아님 · 결정적 패턴)
const SHADES = [
  "bg-emerald-500/70",
  "bg-emerald-600/70",
  "bg-emerald-300/60",
  "bg-emerald-100/50",
  "bg-zinc-200/30",
  "bg-rose-500/60",
];

export default async function GatePage() {
  const token = process.env.GATE_TOKEN;
  if (token && (await cookies()).get("gate")?.value === token) redirect("/");

  const cols = 16;
  const rows = 9;
  const cells = Array.from({ length: cols * rows }, (_, i) => SHADES[(i * 7 + ((i / cols) | 0) * 3) % SHADES.length]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950">
      {/* 블러 처리된 장식 대시보드(가짜) 배경 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-110 blur-2xl"
      >
        <div
          className="grid h-full w-full gap-2 p-6 opacity-60"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {cells.map((c, i) => (
            <div key={i} className={`rounded-md ${c}`} />
          ))}
        </div>
      </div>
      {/* 프로스트 오버레이 */}
      <div aria-hidden className="absolute inset-0 bg-zinc-950/55 backdrop-blur-md" />

      {/* 입장 카드 */}
      <div className="relative z-10 w-[min(92vw,380px)] rounded-2xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 text-center">
          <h1 className="text-lg font-semibold text-white">세정학원 강의실 대시보드</h1>
          <p className="mt-1 text-sm text-white/60">입장 코드를 입력하세요</p>
        </div>
        <PasscodeForm />
        <p className="mt-4 text-center text-[11px] text-white/35">대치 캠퍼스 · 내부용</p>
      </div>
    </main>
  );
}
