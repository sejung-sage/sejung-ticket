// 사용법: node --env-file=.env.local scripts/check-golden.mjs
// eval/golden-dataset.jsonl 의 각 케이스 SQL을 원격 DB(analytics 포함)에 실행해
// expected(±tolerance)와 대조. snapshot_dependent(아카/live 재동기화로 변동)는 fail 대신 drift 경고.
// 연결은 db-apply.mjs와 동일(postgres 롤, 읽기전용 쿼리만).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const pw = process.env.SUPABASE_DB_PASSWORD;
if (!pw) { console.error("❌ SUPABASE_DB_PASSWORD 없음 (.env.local)"); process.exit(1); }

const client = new pg.Client({
  host: "aws-1-ap-northeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.gnqrdgjgapwbofonowxd",
  password: pw,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const fmt = (n) => (n === null ? "null" : Number(n).toLocaleString("en-US"));

async function scalar(sql) {
  const r = await client.query(sql);
  if (!r.rows.length) return null;
  const v = Object.values(r.rows[0])[0];
  return v === null || v === undefined ? null : Number(v);
}

const path = resolve(process.cwd(), "eval/golden-dataset.jsonl");
const cases = readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

await client.connect();
let pass = 0, fail = 0, drift = 0;
const fails = [];

for (const c of cases) {
  let got;
  try {
    got = await scalar(c.sql);
  } catch (e) {
    fail++; fails.push(c.id);
    console.log(`💥 ${c.id.padEnd(30)} SQL 에러: ${e.message}`);
    continue;
  }
  const tol = c.tolerance ?? 0;
  const ok = got !== null && Math.abs(got - c.expected) <= tol;
  if (ok) { pass++; console.log(`✅ ${c.id.padEnd(30)} ${fmt(got)}`); }
  else if (c.snapshot_dependent) { drift++; console.log(`⚠️  ${c.id.padEnd(30)} drift: expected ${fmt(c.expected)} → got ${fmt(got)}`); }
  else { fail++; fails.push(c.id); console.log(`❌ ${c.id.padEnd(30)} expected ${fmt(c.expected)} != got ${fmt(got)} (tol ${tol})`); }
}
await client.end();

console.log(`\n=== ${pass} pass / ${fail} fail / ${drift} drift ===`);
if (fail > 0) { console.error(`실패: ${fails.join(", ")}`); process.exit(1); }
