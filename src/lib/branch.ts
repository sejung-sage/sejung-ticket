import "server-only";

import { cookies } from "next/headers";

/** 분원 목록. dim_lease·dim_classroom에 존재하는 분원과 일치. */
export const BRANCHES = ["대치", "송도", "반포", "방배"] as const;
export type Branch = (typeof BRANCHES)[number];

/** 강의실 사용기록(가동률·좌석 점유율)이 있는 분원. 원천 aca_tickets.classroom
 *  이 채워진 곳만 — 현재 대치뿐. 타 분원은 정원·임대만 참고용. */
const USAGE_BRANCHES: readonly string[] = ["대치"];

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
