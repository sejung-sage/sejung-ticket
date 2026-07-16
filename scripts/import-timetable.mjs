// HWP 시간표 폴더 → analytics.timetable 적재.
// 사용: PYHWP_PY=/tmp/hwpenv/bin/python TT_DIR="<폴더>" node --env-file=.env.local scripts/import-timetable.mjs
// (PYHWP_PY = pyhwp 설치된 venv python. 기본 /tmp/hwpenv/bin/python)
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import pg from "pg";

const PY = process.env.PYHWP_PY || "/tmp/hwpenv/bin/python";
const DIR =
  process.env.TT_DIR ||
  `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs/Desktop`;
const YEAR = Number(process.env.TT_YEAR || 2026);
const DOW = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 7 };

const c = new pg.Client({
  host: "aws-1-ap-northeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.gnqrdgjgapwbofonowxd",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// dim_classroom 유효 강의실 집합 (정규화 검증용)
const valid = new Set(
  (await c.query("select classroom from analytics.dim_classroom where branch='대치'")).rows.map((r) => r.classroom),
);

function normRoom(raw) {
  const s = raw.replace(/전자칠판/g, "").trim();
  const parts = s.split(/\s+/);
  const building = parts[0];
  const tok = parts[1] || "";
  if (/^\d+호$/.test(tok)) {
    const c1 = `${building} ${tok.replace("호", "")}`;
    return valid.has(c1) ? c1 : null;
  }
  if (/^\d+층$/.test(tok)) {
    const n = tok.replace("층", "");
    const c1 = `${building} ${n}01`; // N층 → N01 (대치관/우전관/본관)
    const c2 = `${building} ${tok}`; // 입시관 N층 등
    return valid.has(c1) ? c1 : valid.has(c2) ? c2 : null;
  }
  if (/^\d+$/.test(tok)) {
    const c1 = `${building} ${tok}`;
    return valid.has(c1) ? c1 : null;
  }
  return null;
}

// macOS 한글 파일명은 NFD(분해형)일 수 있어 NFC로 정규화해 매칭 (경로는 원본 사용)
const files = readdirSync(DIR)
  .map((orig) => ({ orig, nfc: orig.normalize("NFC") }))
  .filter((x) => /^[월화수목금토일]\s*\d+_\d+\.hwp$/.test(x.nfc));
console.log(`발견 파일 ${files.length}개:`, files.map((x) => x.nfc).join(", "));

const rows = [];
let unmatchedRooms = new Set();
for (const { orig, nfc } of files) {
  const f = orig;
  const m = nfc.match(/^([월화수목금토일])\s*(\d+)_(\d+)\.hwp$/);
  const weekday = DOW[m[1]];
  const date = `${YEAR}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const cells = JSON.parse(execFileSync(PY, ["scripts/parse_timetable.py", `${DIR}/${f}`]).toString());
  for (const cell of cells) {
    const classroom = normRoom(cell.room_raw);
    if (!classroom) unmatchedRooms.add(cell.room_raw);
    rows.push({
      source_date: date,
      weekday,
      classroom_raw: cell.room_raw,
      classroom,
      teacher: cell.teacher,
      time_norm: cell.time_raw ? cell.time_raw.replace(/~/g, "-").replace(/\./g, "") : null,
      detail: cell.detail,
    });
  }
}

// 재적재: 해당 날짜 삭제 후 insert
const dates = [...new Set(rows.map((r) => r.source_date))];
await c.query("delete from analytics.timetable where source_date = any($1) and branch='대치'", [dates]);
for (const r of rows) {
  await c.query(
    `insert into analytics.timetable (source_date,weekday,classroom_raw,classroom,teacher,time_norm,detail)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [r.source_date, r.weekday, r.classroom_raw, r.classroom, r.teacher, r.time_norm, r.detail],
  );
}
// 시간 분 계산
await c.query(`update analytics.timetable t set (start_min,end_min)=
  (select start_min,end_min from analytics.parse_time_range(t.time_norm))
  where t.time_norm is not null and source_date = any($1)`, [dates]);

const summary = await c.query(
  `select count(*) total, count(classroom) room_ok, count(start_min) time_ok from analytics.timetable where source_date = any($1)`,
  [dates],
);
console.log(`\n적재 ${summary.rows[0].total}행 · 강의실정규화 ${summary.rows[0].room_ok} · 시간파싱 ${summary.rows[0].time_ok}`);
if (unmatchedRooms.size) console.log("⚠️ 미매칭 강의실 헤더:", [...unmatchedRooms].join(" | "));
await c.end();
