// node --env-file=.env.local scripts/analyze2.mjs
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

// payment_state 정확한 distinct + 대략 분포 (큰 표본)
const { data: ps } = await supabase
  .from("aca_tickets")
  .select("payment_state")
  .limit(10000);
const psCount = {};
ps.forEach((r) => (psCount[r.payment_state] = (psCount[r.payment_state] || 0) + 1));
console.log("=== payment_state 분포 (1만 표본) ===");
console.log(psCount);

// class_date 2050 sentinel 비율
const { count: sentinel } = await supabase
  .from("aca_tickets")
  .select("*", { count: "exact", head: true })
  .eq("class_date", "2050-01-01");
console.log("\nclass_date=2050-01-01 (placeholder) 행 수:", sentinel);

// 최근 1개월 실제 수업일 기준 세션 그레인 확인
// 같은 (classroom, class_date, class_name) 에 학생이 여러 명인가?
const { data: grain } = await supabase
  .from("aca_tickets")
  .select("classroom, class_date, class_name, schedule_time, student_name")
  .not("classroom", "is", null)
  .eq("class_date", "2026-05-25")
  .limit(2000);
const sessionMap = {};
grain.forEach((r) => {
  const k = `${r.classroom} || ${r.class_name} || ${r.schedule_time}`;
  (sessionMap[k] = sessionMap[k] || []).push(r.student_name);
});
console.log("\n=== 2026-05-25 세션별 학생 수 (classroom 있는 것, 상위 12) ===");
Object.entries(sessionMap)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 12)
  .forEach(([k, students]) => console.log(`  ${students.length}명  ::  ${k}`));

// 전체 distinct classroom 목록 (큰 표본)
const { data: rooms } = await supabase
  .from("aca_tickets")
  .select("classroom, class_capacity")
  .not("classroom", "is", null)
  .limit(8000);
const roomSet = new Map();
rooms.forEach((r) => {
  if (!roomSet.has(r.classroom)) roomSet.set(r.classroom, new Set());
  roomSet.get(r.classroom).add(r.class_capacity);
});
console.log(`\n=== distinct classroom (표본 ${roomSet.size}개) — 관/정원 ===`);
[...roomSet.entries()].sort().forEach(([room, caps]) =>
  console.log(`  ${room.padEnd(14)} capacities: ${[...caps].sort((a,b)=>a-b).join(", ")}`),
);
