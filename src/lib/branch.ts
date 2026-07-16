import "server-only";

import { cookies } from "next/headers";

/** 분원 목록. dim_lease·dim_classroom에 존재하는 분원과 일치. */
export const BRANCHES = ["대치", "송도", "반포", "방배"] as const;
export type Branch = (typeof BRANCHES)[number];

/** 가동률 집계가 가능한 분원 = analytics.timetable에 시간표가 적재된 곳.
 *  대치(HWP 업로드) + 반포(XLSX 적재). 송도·방배는 정원·임대만 참고용. */
const USAGE_BRANCHES: readonly string[] = ["대치", "반포"];

export const BRANCH_COOKIE = "sj_branch";

function isBranch(v: string | undefined): v is Branch {
  return v != null && (BRANCHES as readonly string[]).includes(v);
}

/** 현재 선택된 분원(쿠키). 미설정/유효하지 않으면 대치. */
export async function getBranch(): Promise<Branch> {
  const v = (await cookies()).get(BRANCH_COOKIE)?.value;
  return isBranch(v) ? v : "대치";
}

/** 그 분원에 가동률 집계에 쓸 강의실 사용기록이 있는가. */
export function hasUsage(branch: string): boolean {
  return USAGE_BRANCHES.includes(branch);
}
