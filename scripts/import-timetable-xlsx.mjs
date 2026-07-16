// 반포 주간 시간표 XLSX → analytics.timetable 적재 (branch='반포').
// 사용: node --env-file=.env.local scripts/import-timetable-xlsx.mjs "<xlsx경로>" [연도=2026]
// 파싱은 scripts/parse_timetable_xlsx.py (openpyxl) 에 위임.
import { execFileSync } from "node:child_process";
import pg from "pg";

const FILE = process.argv[2];
if (!FILE) { console.error("❌ XLSX 경로를 인자로 주세요"); process.exit(1); }
const YEAR = process.argv[3] || String(process.env.TT_YEAR || 2026);
const BRANCH = process.env.TT_BRANCH || "반포";

const days = JSON.parse(
  execFileSync("python3", ["scripts/parse_timetable_xlsx.py", FILE, YEAR], { maxBuffer: 16e6 }).toString(),
);
console.log(`파싱: ${days.length}일, ${days.reduce((n, d) => n + d.cells.length, 0)}칸`);

const c = new pg.Client({
  host: "aws-1-ap-northeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.gnqrdgjgapwbofonowxd",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// dim_classroom 유효 강의실 집합 (파서가 "본관 301" 형태로 이미 정규화해서 옴)
const valid = new Set(
  (await c.query("select classroom from analytics.dim_classroom where branch=$1", [BRANCH])).rows.map((r) => r.classroom),
);

// 재적재: 해당 날짜×지점 삭제 후 insert
const dates = days.map((d) => d.date);
await c.query("delete from analytics.timetable where source_date = any($1) and branch=$2", [dates, BRANCH]);
const unmatched = new Set();
for (const d of days) {
  for (const cell of d.cells) {
    const classroom = valid.has(cell.room_raw) ? cell.room_raw : null;
    if (!classroom) unmatched.add(cell.room_raw);
    await c.query(
      `insert into analytics.timetable (branch,source_date,weekday,classroom_raw,classroom,teacher,time_norm,detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [BRANCH, d.date, d.weekday, cell.room_raw, classroom, cell.teacher, cell.time_raw, cell.detail],
    );
  }
}
await c.query(
  `update analytics.timetable t set (start_min,end_min)=
   (select start_min,end_min from analytics.parse_time_range(t.time_norm))
   where t.time_norm is not null and source_date = any($1) and branch=$2`,
  [dates, BRANCH],
);

const summary = await c.query(
  `select count(*) total, count(classroom) room_ok, count(start_min) time_ok
   from analytics.timetable where source_date = any($1) and branch=$2`,
  [dates, BRANCH],
);
console.log(`적재(${BRANCH}) ${summary.rows[0].total}행 · 강의실정규화 ${summary.rows[0].room_ok} · 시간파싱 ${summary.rows[0].time_ok}`);
if (unmatched.size) console.log("⚠️ 미매칭 강의실 헤더:", [...unmatched].join(" | "));
await c.end();
