// 사용법: node --env-file=.env.local scripts/probe-aggregation.mjs
// 2단계 아키텍처 결정용: (1) PostgREST 서버사이드 집계 가능 여부,
// (2) vw_room_daily 무제한 fetch 시 실제 반환 행수(= max-rows 캡 존재 여부).
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
).schema("analytics");

// (1) 서버사이드 aggregate 시도
console.log("[1] PostgREST aggregate (occupied_min.sum / session_count.sum):");
{
  const { data, error } = await db
    .from("vw_room_daily")
    .select("occupied_min.sum(), operating_min.sum(), session_count.sum()");
  if (error) console.log("   ❌ 불가:", error.message);
  else console.log("   ✅ 가능:", data);
}

// (2) 무제한 fetch 시 반환 행수 vs 전체 count
console.log("\n[2] max-rows 캡 확인:");
{
  const { count } = await db.from("vw_room_daily").select("*", { count: "exact", head: true });
  const { data, error } = await db.from("vw_room_daily").select("class_date");
  if (error) console.log("   ❌", error.message);
  else console.log(`   전체 count=${count}, limit 없이 반환된 행수=${data.length}`,
    data.length < count ? "→ ⚠️ 캡 존재 (페이지네이션 필요)" : "→ ✅ 캡 없음 (전량 반환)");
}
