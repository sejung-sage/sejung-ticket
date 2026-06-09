"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "일별 가동률", icon: "▦" },
  { href: "/rooms", label: "강의실별 가동률", icon: "▥" },
  { href: "/buildings", label: "관별 가동률", icon: "▤" },
  { href: "/capacity", label: "정원 관리", icon: "⚙" },
  { href: "/term", label: "학기/방학 설정", icon: "❄" },
  { href: "/upload", label: "시간표 업로드", icon: "⬆" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-5 py-4">
        <div className="text-lg font-bold text-zinc-900">세정학원</div>
        <div className="text-sm text-zinc-600">강의실 가동률 · 대치</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 p-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-3 text-base transition ${
                active
                  ? "bg-emerald-600 font-semibold text-white"
                  : "font-medium text-zinc-700 hover:bg-zinc-200/70"
              }`}
            >
              <span className="opacity-70">{item.icon}</span>
              {item.label}
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
