"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SearchBox({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [v, setV] = useState(defaultValue ?? "");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qs = v.trim() ? `?q=${encodeURIComponent(v.trim())}` : "";
    start(() => router.push(`${pathname}${qs}`));
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 text-sm">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="강좌명 검색…"
        className="w-56 rounded-md border border-zinc-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 disabled:opacity-60"
      >
        검색
      </button>
    </form>
  );
}
