"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { BranchSelect } from "./BranchSelect";
import { LoadingOverlay } from "./LoadingOverlay";

/** 클릭한 Link의 이동 대기 상태에 맞춰 전체 화면 오버레이를 띄운다.
 *  prefetch={false}여야 동적(DB) 페이지에서 pending이 확실히 잡힌다. */
function NavLoading() {
  const { pending } = useLinkStatus();
  return <LoadingOverlay show={pending} />;
}

const NAV: { href: string; label: string; icon: string; muted?: boolean }[] = [
  { href: "/", label: "일별 가동률", icon: "▦" },
  { href: "/rooms", label: "강의실별 가동률", icon: "▥" },
  { href: "/trend", label: "가동률 추이", icon: "↗" },
  { href: "/buildings", label: "관별 수익성", icon: "▤", muted: true },
  { href: "/leases", label: "관 관리", icon: "₩" },
  { href: "/capacity", label: "정원 관리", icon: "⚙" },
  { href: "/term", label: "학기/방학 설정", icon: "❄" },
  { href: "/upload", label: "시간표 업로드", icon: "⬆" },
];

export function Sidebar({ branch, branches }: { branch: string; branches: string[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-5 py-4">
        <div className="text-lg font-bold text-zinc-900">세정학원</div>
        <BranchSelect current={branch} branches={branches} />
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 p-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const inactive = item.muted
            ? "font-medium text-zinc-400 hover:bg-zinc-200/50"
            : "font-medium text-zinc-700 hover:bg-zinc-200/70";
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-3 text-base transition ${
                active ? "bg-emerald-600 font-semibold text-white" : inactive
              }`}
            >
              <span className="opacity-70">{item.icon}</span>
              {item.label}
              <NavLoading />
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500">
        내부용 · 읽기전용 분석
      </div>
    </aside>
  );
}
