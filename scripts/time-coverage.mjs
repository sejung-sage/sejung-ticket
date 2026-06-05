// node --env-file=.env.local scripts/time-coverage.mjs
// 대치 캠퍼스 + classroom 있는 세션의 schedule_time 분포를 뽑아 파서 커버리지 측정
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

// 페이지네이션으로 대치+classroom 있는 행의 schedule_time 수집
const freq = new Map();
let from = 0;
const PAGE = 1000;
for (let i = 0; i < 60; i++) {
  const { data, error } = await supabase
    .from("aca_tickets")
    .select("schedule_time")
    .eq("branch", "대치")
    .not("classroom", "is", null)
    .range(from, from + PAGE - 1);
  if (error) { console.error(error.message); break; }
  if (!data.length) break;
  data.forEach((r) => {
    const k = r.schedule_time ?? "(null)";
    freq.set(k, (freq.get(k) || 0) + 1);
  });
  from += PAGE;
  if (data.length < PAGE) break;
}

const total = [...freq.values()].reduce((a, b) => a + b, 0);
console.log(`수집 행수: ${total}, distinct schedule_time: ${freq.size}\n`);

// ---- 파서 프로토타입 ----
function parseTimeRange(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (s === "상시" || s === "00:00-24:00" || s === "24:00") return [0, 1440];
  // 한글/특수 제거 전 분리
  const m = s.match(/^([a-z]*)(\d{1,2})(?::(\d{2}))?-([a-z]*)(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let [, p1, h1, m1, p2, h2, m2] = m;
  h1 = +h1; h2 = +h2; m1 = +(m1 || 0); m2 = +(m2 || 0);
  const isPM = (p) => p === "pm" || p === "p";
  const isAM = (p) => p === "am" || p === "a";
  // 시작 보정
  if (isPM(p1) && h1 < 12) h1 += 12;
  if (isAM(p1) && h1 === 12) h1 = 0;
  // 종료 보정: 접두사 없으면 시작 맥락 따라감
  if (isPM(p2) && h2 < 12) h2 += 12;
  else if (isAM(p2) && h2 === 12) h2 = 0;
  else if (!p2) {
    // 접두사 없는 종료: 시작이 PM이거나, 종료시각이 시작보다 작으면 오후로
    let cand = h2;
    if ((isPM(p1) || h1 >= 12) && cand < 12) cand += 12;
    if (cand * 60 + m2 <= h1 * 60 + m1) cand += 12; // 여전히 작으면 +12
    h2 = cand;
  }
  let start = h1 * 60 + m1;
  let end = h2 * 60 + m2;
  if (end <= start || end > 1440 || start < 0) return null;
  return [start, end];
}

let ok = 0, fail = 0;
const fails = [];
for (const [k, c] of freq) {
  if (k === "(null)") { fail += c; continue; }
  const r = parseTimeRange(k);
  if (r) ok += c;
  else { fail += c; fails.push([k, c]); }
}
console.log(`✅ 파싱 성공: ${ok} (${((ok/total)*100).toFixed(1)}%)`);
console.log(`❌ 파싱 실패/null: ${fail} (${((fail/total)*100).toFixed(1)}%)\n`);
console.log("=== 실패 표기 상위 30 (값 / 행수) ===");
fails.sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([k,c])=>console.log(`  ${String(c).padStart(5)}  "${k}"`));

console.log("\n=== 성공 표기 샘플 검산 (상위 20) ===");
[...freq.entries()].filter(([k])=>k!=="(null)").sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k])=>{
  const r = parseTimeRange(k);
  const fmt = (x)=> r ? `${String(Math.floor(x/60)).padStart(2,"0")}:${String(x%60).padStart(2,"0")}` : "?";
  console.log(`  "${k.padEnd(16)}" -> ${r ? `${fmt(r[0])}–${fmt(r[1])} (${r[1]-r[0]}분)` : "FAIL"}`);
});
