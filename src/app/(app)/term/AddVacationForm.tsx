"use client";

import { useActionState, useRef } from "react";
import { addVacation, type TermState } from "./actions";

export function AddVacationForm() {
  const [state, action, pending] = useActionState(addVacation, {} as TermState);
  const ref = useRef<HTMLFormElement>(null);
  if (state.ok && ref.current) ref.current.reset();

  return (
    <form
      ref={ref}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600">시작일</span>
        <input
          name="from"
          type="date"
          required
          className="rounded-md border border-zinc-300 px-2.5 py-1.5 tabular-nums focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600">종료일</span>
        <input
          name="to"
          type="date"
          required
          className="rounded-md border border-zinc-300 px-2.5 py-1.5 tabular-nums focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600">이름(선택)</span>
        <input
          name="label"
          placeholder="예: 여름방학"
          className="rounded-md border border-zinc-300 px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "추가 중…" : "방학 추가"}
      </button>
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      {state.ok && <span className="text-sm text-emerald-700">추가됨</span>}
    </form>
  );
}
