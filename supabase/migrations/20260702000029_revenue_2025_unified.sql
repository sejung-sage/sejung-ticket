-- 2025 연간 통합 매출 뷰
-- 전환기(점프→아카) 중복을 피하기 위해 8월/9월에서 컷:
--   · 2025.1~8월  : analytics.revenue_jump_2025 (점프 정본, 차원별 월 집계, 원 단위)
--   · 2025.9~12월 : public.aca_tickets (아카, class_date 기준 발생매출 = 회당금액 합)
-- 5~8월은 점프(전체)와 아카(램프업)가 겹치므로 점프≤8월 + 아카≥9월로만 합산해 중복 제거.
-- 아카 매출 정의는 dash_building_finance(회당금액 합, sentinel 2050-01-01 제외)와 동일.
-- 공유 프로젝트라 db push 미사용 — db-apply.mjs로 직접 실행 (create or replace, 멱등).

create or replace view analytics.revenue_2025 as
-- 점프: 2025.1~8월 (고유 차원 보존, branch 없음)
select
  j.month,
  '점프'::text        as source,
  j.branch_placeholder as branch,
  j.region,
  j.corp,
  j.category,
  j.student_class,
  j.grade,
  j.subject,
  j.course,
  j.teacher,
  j.amount::bigint    as amount
from (
  select month, null::text as branch_placeholder,
         region, corp, category, student_class, grade, subject, course, teacher, amount
  from analytics.revenue_jump_2025
  where month <= 8
) j
union all
-- 아카: 2025.9~12월 (branch 보존, 점프 고유 차원은 없음 → NULL)
select
  extract(month from t.class_date)::int as month,
  '아카'::text                          as source,
  t.branch,
  null::text as region,
  null::text as corp,
  null::text as category,
  null::text as student_class,
  null::text as grade,
  null::text as subject,
  null::text as course,
  null::text as teacher,
  sum(t.class_amount_per_session)::bigint as amount
from public.aca_tickets t
where t.class_date >= '2025-09-01'
  and t.class_date <  '2026-01-01'
  and t.class_date <> '2050-01-01'
group by extract(month from t.class_date), t.branch;

comment on view analytics.revenue_2025 is
  '2025 연간 통합 매출: 점프(≤8월, revenue_jump_2025) + 아카(≥9월, aca_tickets 회당금액 합). 연간≈237.9억. 8월/9월 컷으로 전환기 중복 제거. 스코프=수업 수강료(B2C 티켓); 학종관(입시컨설팅 ≈4.6억)은 세션 데이터가 없어 제외 → FP&A 정본 통합탭(241.85억)보다 ~1.6% 낮음(오류 아님, 정의 차이).';

-- 월별 요약 (12행) — PostgREST 집계/1000행 제약 없이 연간 매출 조회용
create or replace view analytics.revenue_2025_monthly as
select
  month,
  source,
  sum(amount)::bigint as amount
from analytics.revenue_2025
group by month, source
order by month;

comment on view analytics.revenue_2025_monthly is
  '2025 월별 통합 매출 요약 (month, source, amount). analytics.revenue_2025 롤업.';
