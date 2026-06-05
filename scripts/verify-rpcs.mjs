// 사용법: node --env-file=.env.local scripts/verify-rpcs.mjs
// 대시보드 집계 RPC 4종을 supabase-js로 호출해 결과 sanity 체크.
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
).schema("analytics");

const show = (label, { data, error }) =>
  console.log(error ? `❌ ${label}: ${error.message}` : `✅ ${label}:`, error ? "" : JSON.stringify(data, null, 0).slice(0, 600));

// 0) 필터 옵션 (기간/건물/강의실)
const opts = await db.rpc("dash_filter_options");
show("dash_filter_options", opts);
const maxDate = opts.data?.[0]?.max_date;
const from = maxDate ? new Date(new Date(maxDate).getTime() - 27 * 864e5).toISOString().slice(0, 10) : null;
console.log(`   → 최근 4주 필터: ${from} ~ ${maxDate}`);

// 1) 전체 KPI (필터 없음)
show("dash_kpis (전체)", await db.rpc("dash_kpis", {}));

// 2) 최근 4주 + 대치관 KPI
show("dash_kpis (4주·대치관)", await db.rpc("dash_kpis", { p_from: from, p_to: maxDate, p_building: "대치관" }));

// 3) 추이 (주 단위, 최근 4주)
const trend = await db.rpc("dash_trend", { p_from: from, p_to: maxDate, p_granularity: "week" });
show("dash_trend (주, 최근4주)", trend);
console.log(`   → 버킷 ${trend.data?.length ?? 0}개`);

// 4) 건물별 (최근 4주)
show("dash_building (4주)", await db.rpc("dash_building", { p_from: from, p_to: maxDate }));

console.log("\n검증 완료");
