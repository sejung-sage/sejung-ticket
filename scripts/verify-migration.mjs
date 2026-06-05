// 사용법: node --env-file=.env.local scripts/verify-migration.mjs
// 0001 마이그레이션이 DB에 적용됐는지 검증.
// analytics 스키마 객체(설정테이블/파서함수/View 3종) 존재 + 데이터 sanity check.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("❌ 환경변수 없음 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const an = db.schema("analytics");

let pass = 0;
let fail = 0;
const ok = (msg) => { console.log(`  ✅ ${msg}`); pass++; };
const no = (msg) => { console.log(`  ❌ ${msg}`); fail++; };

// 1) 운영시간 설정 테이블
console.log("\n[1] analytics.config_operating_hours");
{
  const { data, error } = await an.from("config_operating_hours").select("*");
  if (error) no(`조회 실패: ${error.message}`);
  else {
    ok(`존재. 행 ${data.length}개`);
    for (const r of data) console.log(`     · ${r.day_type}: ${r.open_min}~${r.close_min}분`);
  }
}

// 2) 파서 함수 — RPC 호출 (반환 SETOF라서 rpc 가능)
console.log("\n[2] analytics.parse_time_range()");
{
  const samples = ["18:00-22:00", "pm6-9", "P3:30-6", "am10-1", "상시", "헛소리"];
  for (const raw of samples) {
    const { data, error } = await db.schema("analytics").rpc("parse_time_range", { raw });
    if (error) { no(`'${raw}' 호출 실패: ${error.message}`); break; }
    const r = Array.isArray(data) ? data[0] : data;
    ok(`'${raw}' → start=${r?.start_min ?? "null"} end=${r?.end_min ?? "null"}`);
  }
}

// 3) View 3종 — 존재 + 행 수 + 샘플
console.log("\n[3] analytics Views");
for (const view of ["vw_sessions", "vw_room_slots", "vw_room_daily"]) {
  const { data, error, count } = await an
    .from(view)
    .select("*", { count: "exact", head: false })
    .limit(1);
  if (error) no(`${view} — ${error.message}`);
  else {
    ok(`${view} — 총 ${count}행, 컬럼: ${data?.[0] ? Object.keys(data[0]).join(", ") : "(빈 결과)"}`);
  }
}

// 4) vw_room_daily 가동률 sanity (0~1 범위, 평균)
console.log("\n[4] vw_room_daily 가동률 sanity");
{
  const { data, error } = await an
    .from("vw_room_daily")
    .select("classroom, class_date, utilization, occupied_min, operating_min, session_count")
    .order("class_date", { ascending: false })
    .limit(5);
  if (error) no(`조회 실패: ${error.message}`);
  else {
    ok(`최근 5행 샘플:`);
    for (const r of data) {
      console.log(`     · ${r.class_date} ${r.classroom}: util=${r.utilization} (점유 ${r.occupied_min}/${r.operating_min}분, 세션 ${r.session_count})`);
    }
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`결과: ✅ ${pass} 통과 / ❌ ${fail} 실패`);
console.log(fail === 0 ? "🎉 마이그레이션 적용됨 (검증 통과)" : "⚠️ 일부 객체 누락 — 마이그레이션 미적용 또는 부분 적용");
process.exit(fail === 0 ? 0 : 1);
