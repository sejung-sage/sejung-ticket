"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type TermState = { error?: string; ok?: boolean };

function revalidate() {
  revalidatePath("/term");
  revalidatePath("/");
  revalidatePath("/rooms");
}

/** 방학 기간 추가. (학기중은 별도 등록 불필요 — 방학 아닌 기간 = 학기중) */
export async function addVacation(_prev: TermState, formData: FormData): Promise<TermState> {
  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || null;
  if (!from || !to) return { error: "시작·종료 날짜를 입력하세요." };
  if (to < from) return { error: "종료일이 시작일보다 빠릅니다." };

  const db = createAdminClient().schema("analytics");
  const { error } = await db.from("config_term").insert({ from_date: from, to_date: to, label });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteVacation(formData: FormData) {
  const id = Number(formData.get("id"));
  const db = createAdminClient().schema("analytics");
  await db.from("config_term").delete().eq("id", id);
  revalidate();
}
