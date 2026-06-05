// 사용법: node --env-file=.env.local scripts/analyze-tickets.mjs
// 강의실 가동률 PRD 작성용: 핵심 컬럼 결측률 / 카디널리티 / 값 분포 분석
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TOTAL = 419035;

// 특정 컬럼이 null이 아닌 행 수
async function nonNull(col) {
  const { count } = await supabase
    .from("aca_tickets")
    .select(col, { count: "exact", head: true })
    .not(col, "is", null);
  return count;
}

// 컬럼별 결측 분석
const cols = [
  "classroom",
  "schedule_days",
  "schedule_time",
  "class_date",
  "due_date",
  "used_at",
  "class_capacity",
  "teacher_name",
  "branch",
  "class_name",
  "paid_at",
];

console.log("=== 컬럼별 값 존재율 (non-null / 전체) ===");
for (const c of cols) {
  const n = await nonNull(c);
  const pct = ((n / TOTAL) * 100).toFixed(1);
  console.log(`${c.padEnd(18)} ${String(n).padStart(7)}  (${pct}%)`);
}

// 특정 컬럼의 distinct 값 상위 표본 (head로 카디널리티 대략 파악)
async function sampleDistinct(col, limit = 4000) {
  const { data } = await supabase
    .from("aca_tickets")
    .select(col)
    .not(col, "is", null)
    .limit(limit);
  const set = new Set(data.map((r) => r[col]));
  return set;
}

console.log("\n=== 표본 기반 distinct 값 ===");
for (const c of ["branch", "classroom", "payment_state", "class_type1", "subject_raw", "class_grade"]) {
  const s = await sampleDistinct(c);
  const vals = [...s].slice(0, 25);
  console.log(`\n[${c}] 표본 distinct ~${s.size}개${s.size > 25 ? " (상위 25)" : ""}:`);
  console.log("  " + vals.join(" | "));
}

// schedule_time 형식 표본
console.log("\n=== schedule_time 형식 표본 (20개) ===");
const { data: st } = await supabase
  .from("aca_tickets")
  .select("schedule_days, schedule_time")
  .not("schedule_time", "is", null)
  .limit(20);
st.forEach((r) => console.log(`  ${r.schedule_days} / ${r.schedule_time}`));

// class_date 범위
console.log("\n=== class_date 범위 ===");
const { data: minD } = await supabase
  .from("aca_tickets")
  .select("class_date")
  .not("class_date", "is", null)
  .order("class_date", { ascending: true })
  .limit(1);
const { data: maxD } = await supabase
  .from("aca_tickets")
  .select("class_date")
  .not("class_date", "is", null)
  .order("class_date", { ascending: false })
  .limit(1);
console.log(`  min: ${minD[0]?.class_date}  max: ${maxD[0]?.class_date}`);

// classroom이 채워진 행의 샘플 (실제 강의실 값 확인)
console.log("\n=== classroom 채워진 행 샘플 (8개) ===");
const { data: cr } = await supabase
  .from("aca_tickets")
  .select("branch, classroom, class_name, schedule_days, schedule_time, class_date, class_capacity")
  .not("classroom", "is", null)
  .limit(8);
cr.forEach((r) =>
  console.log(`  [${r.branch}] room=${r.classroom} | ${r.schedule_days} ${r.schedule_time} | cap=${r.class_capacity} | ${r.class_date}`),
);
