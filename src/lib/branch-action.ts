"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { BRANCH_COOKIE, BRANCHES } from "./branch";

/** 전역 분원 선택 저장. 모든 페이지가 쿠키를 읽으므로 레이아웃 전체를 재검증. */
export async function setBranch(branch: string): Promise<void> {
  if (!(BRANCHES as readonly string[]).includes(branch)) return;
  (await cookies()).set(BRANCH_COOKIE, branch, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
