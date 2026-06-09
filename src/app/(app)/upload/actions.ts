"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

type Cell = { room_raw: string; teacher: string; time_raw: string | null; detail: string };
export type ImportItem = { source_date: string; weekday: number; cells: Cell[] };
export type ImportResult = { source_date: string; inserted: number; error?: string };

/** 파싱된 칸들을 analytics.timetable 에 적재하고 채움 MV를 갱신. */
export async function importParsed(
  items: ImportItem[],
): Promise<{ results: ImportResult[]; refreshed: boolean; refreshError?: string }> {
  const db = createAdminClient().schema("analytics");
  const results: ImportResult[] = [];

  for (const it of items) {
    const { data, error } = await db.rpc("import_timetable", {
      p_source_date: it.source_date,
      p_weekday: it.weekday,
      p_cells: it.cells,
    });
    results.push({
      source_date: it.source_date,
      inserted: error ? 0 : (data ?? 0),
      error: error?.message,
    });
  }

  const { error: rErr } = await db.rpc("refresh_fill");
  revalidatePath("/");
  revalidatePath("/rooms");
  revalidatePath("/upload");

  return { results, refreshed: !rErr, refreshError: rErr?.message };
}
