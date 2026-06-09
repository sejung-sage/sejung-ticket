-- 학기중/방학 구분: 방학 기간만 등록(나머지는 학기중). 방학 평일은 3세션, 학기중 평일은 1세션(저녁).
create table if not exists analytics.config_term (
  id bigserial primary key,
  from_date date not null,
  to_date   date not null check (to_date >= from_date),
  label     text,
  created_at timestamptz not null default now()
);
grant select on analytics.config_term to anon, authenticated, service_role;
grant insert, update, delete on analytics.config_term to service_role;
grant usage, select on sequence analytics.config_term_id_seq to service_role;

create or replace function analytics.is_vacation(d date) returns boolean language sql stable as $$
  select exists (select 1 from analytics.config_term where d between from_date and to_date);
$$;

-- 날짜별 운영 세션 수: 주말 3, 방학 평일 3, 학기중 평일 1
create or replace function analytics.op_sessions(d date) returns int language sql stable as $$
  select case when extract(isodow from d) in (6,7) then 3
              when analytics.is_vacation(d) then 3
              else 1 end;
$$;

-- dash_room_session: 운영세션/보강을 날짜 학기·방학에 맞게
drop function if exists analytics.dash_room_session(date,date,text,int[]);
create function analytics.dash_room_session(
  p_from date default null, p_to date default null, p_building text default null, p_dow int[] default null)
returns table (building text, classroom text, operating_sessions bigint, used_sessions bigint,
  tickets bigint, capacity int, m1 numeric, m2 numeric, m3 numeric,
  exception_sessions bigint, exception_tickets bigint)
language sql stable as $$
  with total_op as (
    select coalesce(sum(analytics.op_sessions(class_date)),0) total
    from (select distinct class_date from analytics.mv_room_daily
          where (p_from is null or class_date>=p_from) and (p_to is null or class_date<=p_to)
            and (p_dow is null or dow=any(p_dow))) d
  ),
  rooms as (
    select rd.building, rd.classroom,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date)
               then (rd.t_morning>0)::int + (rd.t_afternoon>0)::int + (rd.t_evening>0)::int
               else (rd.t_evening>0)::int end) as used,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date)
               then rd.t_morning+rd.t_afternoon+rd.t_evening
               else rd.t_evening end) as tickets,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date) then 0
               else (rd.t_morning>0)::int + (rd.t_afternoon>0)::int end) as exc_sess,
      sum(case when rd.dow in (6,7) or analytics.is_vacation(rd.class_date) then 0
               else rd.t_morning+rd.t_afternoon end) as exc_tix
    from analytics.mv_room_daily rd
    where (p_from is null or rd.class_date>=p_from) and (p_to is null or rd.class_date<=p_to)
      and (p_building is null or rd.building=p_building) and (p_dow is null or rd.dow=any(p_dow))
    group by 1,2
  )
  select r.building, r.classroom,
    (select total from total_op)::bigint, r.used::bigint, r.tickets::bigint, dc.capacity,
    round(r.used::numeric/nullif((select total from total_op),0),4),
    round(r.tickets::numeric/nullif(r.used*dc.capacity,0),4),
    round(r.tickets::numeric/nullif((select total from total_op)*dc.capacity,0),4),
    r.exc_sess::bigint, r.exc_tix::bigint
  from rooms r left join analytics.dim_classroom dc on dc.branch='대치' and dc.classroom=r.classroom
  order by 9 desc nulls last;
$$;

-- 일별 세션카드용: 그 날짜의 강의실당 운영세션 수
create or replace function analytics.day_op_sessions(d date) returns int language sql stable as $$
  select analytics.op_sessions(d);
$$;

grant execute on function analytics.is_vacation(date) to anon, authenticated, service_role;
grant execute on function analytics.op_sessions(date) to anon, authenticated, service_role;
grant execute on function analytics.day_op_sessions(date) to anon, authenticated, service_role;
grant execute on function analytics.dash_room_session(date,date,text,int[]) to anon, authenticated, service_role;
