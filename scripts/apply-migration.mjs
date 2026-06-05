// 사용법: node --env-file=.env.local scripts/apply-migration.mjs
// analytics 마이그레이션을 원격 DB에 "직접" 실행 (db push 미사용 — CRM과 공유 프로젝트라
// 마이그레이션 이력 테이블을 건드리지 않기 위함). 실행 후 카탈로그로 검증까지 수행.
import { readFileSync } from "node:fs";
import pg from "pg";

const pw = process.env.SUPABASE_DB_PASSWORD;
if (!pw) { console.error("❌ SUPABASE_DB_PASSWORD 없음"); process.exit(1); }

const sql = readFileSync(
  new URL("../supabase/migrations/20260605000001_analytics_classroom_utilization.sql", import.meta.url),
  "utf8",
);

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
  console.log("✅ 원격 DB 연결됨 (session pooler)");

  console.log("▶ 마이그레이션 실행 중...");
  await client.query(sql);
  console.log("✅ 마이그레이션 SQL 실행 완료 (에러 없음)");

  // --- 검증: 카탈로그 ---
  const inv = await client.query(`
    select
      (select count(*) from pg_namespace where nspname='analytics') as schema_exists,
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='analytics' and c.relkind in ('r','v','m')) as n_relations,
      (select string_agg(c.relname,', ' order by c.relname) from pg_class c
         join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='analytics' and c.relkind in ('r','v','m')) as relations,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='analytics' and p.proname='parse_time_range') as has_parser;
  `);
  console.log("\n[검증 1] 객체 인벤토리:", inv.rows[0]);

  // --- 검증: 파서 동작 ---
  const samples = ["18:00-22:00", "pm6-9", "P3:30-6", "am10-1", "상시", "헛소리"];
  console.log("\n[검증 2] parse_time_range():");
  for (const raw of samples) {
    const r = await client.query("select * from analytics.parse_time_range($1)", [raw]);
    console.log(`   '${raw}' → start=${r.rows[0].start_min} end=${r.rows[0].end_min}`);
  }

  // --- 검증: 핵심 집계 View 데이터 sanity ---
  const daily = await client.query(`
    select count(*) as rows,
           round(avg(utilization),4) as avg_util,
           min(class_date) as min_date, max(class_date) as max_date
    from analytics.vw_room_daily;
  `);
  console.log("\n[검증 3] vw_room_daily:", daily.rows[0]);

  const sample = await client.query(`
    select class_date, classroom, utilization, occupied_min, operating_min, session_count
    from analytics.vw_room_daily
    order by class_date desc, utilization desc limit 5;
  `);
  console.log("   최근 샘플 5행:");
  for (const r of sample.rows) {
    console.log(`     · ${r.class_date.toISOString().slice(0,10)} ${r.classroom}: util=${r.utilization} (${r.occupied_min}/${r.operating_min}분, 세션 ${r.session_count})`);
  }

  console.log("\n🎉 적용 + 검증 완료");
} catch (e) {
  console.error("\n❌ 실패:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
