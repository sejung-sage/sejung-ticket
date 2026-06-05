// 사용법: node --env-file=.env.local scripts/inspect-tickets.mjs
// aca_tickets 연결 확인 + 컬럼/샘플 출력 (PRD 작성 및 환경 검증용)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("❌ 환경변수 없음. .env.local을 채워주세요.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const { data, error, count } = await supabase
  .from("aca_tickets")
  .select("*", { count: "exact" })
  .limit(3);

if (error) {
  console.error("❌ 조회 실패:", error.message);
  process.exit(1);
}

console.log(`✅ 연결 성공. aca_tickets 총 행 수: ${count}`);
if (data?.length) {
  console.log("\n📋 컬럼:", Object.keys(data[0]).join(", "));
  console.log("\n🔎 샘플 행 (최대 3개):");
  console.dir(data, { depth: null });
} else {
  console.log("⚠️ 행이 없습니다.");
}
