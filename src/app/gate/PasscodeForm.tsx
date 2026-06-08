"use client";

import { useActionState } from "react";
import { verifyCode, type GateState } from "./actions";

const initial: GateState = {};

export function PasscodeForm() {
  const [state, action, pending] = useActionState(verifyCode, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input
        name="code"
        type="password"
        autoFocus
        autoComplete="off"
        placeholder="입장 코드"
        aria-label="입장 코드"
        className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-center text-lg tracking-widest text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
      />
      {state.error && (
        <p className="text-center text-sm text-rose-300">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {pending ? "확인 중…" : "입장"}
      </button>
    </form>
  );
}
