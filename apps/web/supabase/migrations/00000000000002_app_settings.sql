-- P2: 앱 전역 설정 단일행 + Managed Agents 프로비전 캐시
create table app_settings (
  id int primary key default 1 check (id = 1),
  run_cost_cap_usd numeric(10,2) not null default 5,
  anthropic_environment_id text,
  anthropic_agent_id text,
  agent_config_hash text,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (1);

alter table app_settings enable row level security;
create policy "team read app_settings" on app_settings
  for select to authenticated using (true);
create policy "admin update app_settings" on app_settings
  for update to authenticated using (is_admin()) with check (is_admin());
-- insert/delete 정책 없음: 단일행 고정. 서버(service role)는 RLS 우회.
