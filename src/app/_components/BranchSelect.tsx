"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setBranch } from "@/lib/branch-action";
import { LoadingOverlay } from "./LoadingOverlay";

/** 전역 분원 선택기(사이드바 헤더). 변경 시 쿠키 저장 후 전체 새로고침. */
export function BranchSelect({ current, branches }: { current: string; branches: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <>
      <label className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600">
        <span className="shrink-0">분원</span>
        <select
          value={current}
          onChange={(e) => {
            const b = e.target.value;
            start(async () => {
              await setBranch(b);
              router.refresh();
            });
          }}
          disabled={pending}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 font-medium text-zinc-900 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
        >
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <LoadingOverlay show={pending} />
    </>
  );
}
