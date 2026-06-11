"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type LeaseState = { saved?: number; error?: string };

type Editable = {
  area_py: number | null;
  rent_monthly: number | null;
  deposit: number | null;
  maintenance: number | null;
  lease_from: string | null;
  lease_to: string | null;
};

/** "" → null, 콤마 허용, 음수/비수 → 오류. */
function intOrNull(raw: string): number | null | "err" {
  const s = raw.trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return "err";
  return Math.round(n);
}
const dateOrNull = (raw: string) => (raw.trim() === "" ? null : raw.trim());

/** 변경된 계약(층)만 dim_lease 에 반영(대치). 입력 name = `<field>:<idx>` (pk = bld/lbl). */
export async function updateLeases(_prev: LeaseState, formData: FormData): Promise<LeaseState> {
  const db = createAdminClient().schema("analytics");

  // 1) 폼을 idx별로 모음
  const byIdx = new Map<string, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^(bld|lbl|area|rent|deposit|maint|from|to):(\d+)$/);
    if (!m) continue;
    const [, field, idx] = m;
    if (!byIdx.has(idx)) byIdx.set(idx, {});
    byIdx.get(idx)![field] = String(value);
  }

  // 2) 현재값 조회 → pk 맵
  const { data: current, error } = await db
    .from("dim_lease")
    .select("building, lease_label, area_py, rent_monthly, deposit, maintenance, lease_from, lease_to")
    .eq("branch", "대치");
  if (error) return { error: `현재값 조회 실패: ${error.message}` };
  const curMap = new Map(current?.map((r) => [`${r.building}${r.lease_label}`, r]) ?? []);

  // 3) 변경분만 추출
  const updates: { building: string; lease_label: string; values: Editable }[] = [];
  for (const row of byIdx.values()) {
    const building = row.bld;
    const lease_label = row.lbl;
    if (!building || !lease_label) continue;
    const cur = curMap.get(`${building}${lease_label}`);
    if (!cur) continue;

    const nums = {
      area_py: intOrNull(row.area ?? ""),
      rent_monthly: intOrNull(row.rent ?? ""),
      deposit: intOrNull(row.deposit ?? ""),
      maintenance: intOrNull(row.maint ?? ""),
    };
    for (const [f, v] of Object.entries(nums)) {
      if (v === "err") return { error: `${building} ${lease_label}: ${f} 값이 올바르지 않습니다` };
    }
    const values: Editable = {
      area_py: nums.area_py as number | null,
      rent_monthly: nums.rent_monthly as number | null,
      deposit: nums.deposit as number | null,
      maintenance: nums.maintenance as number | null,
      lease_from: dateOrNull(row.from ?? ""),
      lease_to: dateOrNull(row.to ?? ""),
    };

    const changed = (Object.keys(values) as (keyof Editable)[]).some(
      (k) => (cur[k] ?? null) !== values[k],
    );
    if (changed) updates.push({ building, lease_label, values });
  }

  // 4) 반영
  for (const u of updates) {
    const { error: e } = await db
      .from("dim_lease")
      .update(u.values)
      .eq("branch", "대치")
      .eq("building", u.building)
      .eq("lease_label", u.lease_label);
    if (e) return { error: `${u.building} ${u.lease_label} 저장 실패: ${e.message}` };
  }

  revalidatePath("/leases");
  revalidatePath("/buildings");
  return { saved: updates.length };
}
