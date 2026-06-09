-- 웹 업로드용: 강의실 정규화 + 시간표 적재 + 채움 갱신 RPC

-- 강의실 헤더 → dim_classroom.classroom 정규화 (N층→N01, NNN호→NNN, 입시관 N층은 그대로)
create or replace function analytics.norm_room(raw text)
returns text language plpgsql stable as $$
declare s text; b text; tok text; cand text;
begin
  s := trim(regexp_replace(coalesce(raw,''), '전자칠판', '', 'g'));
  b := split_part(s, ' ', 1);
  tok := split_part(s, ' ', 2);
  if tok ~ '^\d+호$' then
    cand := b || ' ' || replace(tok, '호', '');
  elsif tok ~ '^\d+층$' then
    cand := b || ' ' || replace(tok, '층', '') || '01';
    if not exists (select 1 from analytics.dim_classroom where classroom = cand) then
      cand := b || ' ' || tok;
    end if;
  elsif tok ~ '^\d+$' then
    cand := b || ' ' || tok;
  else
    return null;
  end if;
  if exists (select 1 from analytics.dim_classroom where branch = '대치' and classroom = cand) then
    return cand;
  end if;
  return null;
end $$;

-- 칸 배열(jsonb) → timetable 적재 (해당 날짜 재적재)
create or replace function analytics.import_timetable(p_source_date date, p_weekday int, p_cells jsonb)
returns int language plpgsql as $$
declare cell jsonb; tnorm text; pr record; n int := 0;
begin
  delete from analytics.timetable where source_date = p_source_date;
  for cell in select * from jsonb_array_elements(p_cells) loop
    tnorm := nullif(replace(coalesce(cell->>'time_raw', ''), '~', '-'), '');
    select * into pr from analytics.parse_time_range(tnorm);
    insert into analytics.timetable
      (source_date, weekday, classroom_raw, classroom, teacher, time_norm, start_min, end_min, detail)
    values
      (p_source_date, p_weekday, cell->>'room_raw', analytics.norm_room(cell->>'room_raw'),
       cell->>'teacher', tnorm, pr.start_min, pr.end_min, cell->>'detail');
    n := n + 1;
  end loop;
  return n;
end $$;

-- 채움/집계 MV 즉시 갱신 (비동시 — 함수 내 실행 가능, 짧게 잠금)
create or replace function analytics.refresh_fill()
returns void language plpgsql as $$
begin
  refresh materialized view analytics.mv_ticket_fill;
  refresh materialized view analytics.mv_room_daily;
end $$;

grant execute on function analytics.norm_room(text) to service_role;
grant execute on function analytics.import_timetable(date,int,jsonb) to service_role;
grant execute on function analytics.refresh_fill() to service_role;
