// 사용법: node --env-file=.env.local scripts/db-apply.mjs <sql파일경로>
// 임의의 SQL 파일을 원격 DB에 직접 실행 (db push 미사용 — CRM 공유 프로젝트라
// 마이그레이션 이력 테이블을 건드리지 않음). 멱등 마이그레이션 권장(create or replace 등).
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) { console.error("❌ SQL 파일 경로를 인자로 주세요"); process.exit(1); }
const pw = process.env.SUPABASE_DB_PASSWORD;
if (!pw) { console.error("❌ SUPABASE_DB_PASSWORD 없음 (.env.local)"); process.exit(1); }

const sql = readFileSync(file, "utf8");
const client = new pg.Client({
  host: "aws-1-ap-northeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.gnqrdgjgapwbofonowxd",
  password: pw,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`✅ 연결됨. 실행: ${file}`);
  await client.query(sql);
  console.log("✅ SQL 실행 완료 (에러 없음)");
} catch (e) {
  console.error("❌ 실패:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
