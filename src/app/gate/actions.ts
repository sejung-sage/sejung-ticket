"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type GateState = { error?: string };

/** 입장 코드 검증 → 일치 시 서버 비밀 토큰을 httpOnly 쿠키로 발급 후 / 로 이동. */
export async function verifyCode(_prev: GateState, formData: FormData): Promise<GateState> {
  const code = String(formData.get("code") ?? "").trim();
  const expected = process.env.DASHBOARD_CODE;
  const token = process.env.GATE_TOKEN;

  if (!expected || !token) return { error: "게이트가 설정되지 않았습니다(환경변수)." };
  if (!code) return { error: "코드를 입력하세요." };
  if (code !== expected) return { error: "코드가 올바르지 않습니다." };

  const jar = await cookies();
  jar.set("gate", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });

  redirect("/");
}
