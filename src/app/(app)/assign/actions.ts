"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type AssignState = { saved?: number; error?: string };

/** 화면의 강좌별 배정값(assign:<class_name> = classroom)을 class_room_assignment 에 반영. */
export async function saveAssignments(
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const db = createAdminClient().schema("analytics");

  const rows: { class_name: string; classroom: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("assign:")) continue;
    rows.push({ class_name: key.slice(7), classroom: String(value).trim() || null });
  }
  if (rows.length === 0) return { saved: 0 };

  const names = rows.map((r) => r.class_name);
  const { data: cur, error } = await db
    .from("class_room_assignment")
    .select("class_name, classroom")
    .in("class_name", names);
  if (error) return { error: `현재값 조회 실패: ${error.message}` };

  const curMap = new Map((cur ?? []).map((r) => [r.class_name, r.classroom]));
  const changed = rows.filter((r) => (curMap.get(r.class_name) ?? null) !== r.classroom);

  const toUpsert = changed
    .filter((r) => r.classroom !== null)
    .map((r) => ({ class_name: r.class_name, classroom: r.classroom, updated_at: new Date().toISOString() }));
  const toDelete = changed.filter((r) => r.classroom === null).map((r) => r.class_name);

  if (toUpsert.length) {
    const { error: e } = await db
      .from("class_room_assignment")
      .upsert(toUpsert, { onConflict: "class_name" });
    if (e) return { error: `저장 실패: ${e.message}` };
  }
  if (toDelete.length) {
    const { error: e } = await db.from("class_room_assignment").delete().in("class_name", toDelete);
    if (e) return { error: `해제 실패: ${e.message}` };
  }

  revalidatePath("/assign");
  return { saved: changed.length };
}
