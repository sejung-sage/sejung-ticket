"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type CapacityState = { saved?: number; error?: string };

/** 변경된 강의실 정원만 dim_classroom 에 반영(대치). 입력칸 name = `cap:<classroom>`. */
export async function updateCapacities(
  _prev: CapacityState,
  formData: FormData,
): Promise<CapacityState> {
  const db = createAdminClient().schema("analytics");

  const { data: current, error } = await db
    .from("dim_classroom")
    .select("classroom, capacity")
    .eq("branch", "대치");
  if (error) return { error: `현재값 조회 실패: ${error.message}` };

  const curMap = new Map((current ?? []).map((r) => [r.classroom, r.capacity]));
  const updates: { classroom: string; capacity: number | null }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("cap:")) continue;
    const classroom = key.slice(4);
    if (!curMap.has(classroom)) continue;
    const raw = String(value).trim();
    const cap = raw === "" ? null : Number(raw);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) continue;
    if ((curMap.get(classroom) ?? null) !== cap) updates.push({ classroom, capacity: cap });
  }

  for (const u of updates) {
    const { error: e } = await db
      .from("dim_classroom")
      .update({ capacity: u.capacity })
      .eq("branch", "대치")
      .eq("classroom", u.classroom);
    if (e) return { error: `${u.classroom} 저장 실패: ${e.message}` };
  }

  revalidatePath("/capacity");
  revalidatePath("/");
  revalidatePath("/rooms");
  return { saved: updates.length };
}
