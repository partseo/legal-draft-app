-- Supabase 무료 플랜 일시정지 방지용 하트비트.
--
-- app_settings 에 컬럼을 붙이지 않고 테이블을 따로 둔다. app_settings.updated_at 은
-- "설정이 바뀐 시각"이라는 뜻을 갖고 있는데, 하루 몇 번씩 갱신되는 핑이 섞이면
-- 그 의미가 망가진다.
create table keepalive_heartbeat (
  id int primary key default 1 check (id = 1),
  last_ping_at timestamptz not null default now(),
  ping_count bigint not null default 0
);

insert into keepalive_heartbeat (id) values (1);

alter table keepalive_heartbeat enable row level security;
-- 정책 없음 = 일반 사용자 전면 차단. 쓰는 주체는 service_role 뿐이고 RLS 를 우회한다.

-- 갱신과 조회를 한 번의 왕복으로 끝낸다. 시각은 클라이언트가 아니라 DB 가 찍어야
-- 스케줄러 호스트의 시계가 틀려도 기록이 어긋나지 않는다.
create or replace function keepalive_ping()
returns keepalive_heartbeat
language sql
as $$
  update keepalive_heartbeat
     set last_ping_at = now(),
         ping_count = ping_count + 1
   where id = 1
  returning *;
$$;

-- PostgREST 로 노출되는 대상은 service_role 뿐이다 (anon/authenticated 에 부여하지 않는다).
revoke all on function keepalive_ping() from public;
grant execute on function keepalive_ping() to service_role;
