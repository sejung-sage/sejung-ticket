"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { LoadingOverlay } from "./LoadingOverlay";

export function SortControl({
  value,
  options,
  param = "sort",
}: {
  value: string;
  options: { value: string; label: string }[];
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function set(v: string) {
    const p = new URLSearchParams(window.location.search);
    p.set(param, v);
    start(() => router.push(`${pathname}?${p.toString()}`));
  }

  return (
    <>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <LoadingOverlay show={pending} />
    </>
  );
}
