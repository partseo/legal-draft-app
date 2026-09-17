-- 법률문서 작성기 초기 스키마 (스펙 §4)
-- 단일 팀 인스턴스: 모든 authenticated 사용자가 팀원이다.

create type user_role as enum ('admin', 'member');
create type round_kind as enum ('소장', '준비서면');
create type run_stage as enum ('intake', 'research', 'draft', 'verify');
create type run_status as enum ('running', 'waiting_checkpoint', 'succeeded', 'failed', 'canceled');
create type checkpoint_type as enum ('쟁점승인', '질문');
create type checkpoint_status as enum ('대기', '응답됨');
create type file_kind as enum ('입력', '사건컨텍스트', '리서치', '서면', '검증보고', 'context_json');
create type review_decision as enum ('승인', '수정지시');

-- 팀 멤버 프로필 (auth.users 1:1)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role user_role not null default 'member',
  created_at timestamptz not null default now()
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default '대기',
  assignee uuid references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  kind round_kind not null,
  seq int not null,
  created_at timestamptz not null default now(),
  unique (case_id, seq)
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  stage run_stage not null,
  status run_status not null default 'running',
  agent_session_id text,
  instruction text, -- 수정 지시 재실행 시 지시문
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(10,4) not null default 0,
  error text,
  started_by uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  kind checkpoint_type not null,
  status checkpoint_status not null default '대기',
  payload jsonb not null,
  response jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references profiles(id)
);

create table case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  kind file_kind not null,
  filename text not null,
  storage_path text not null unique,
  version int not null default 1,
  created_by_run uuid references runs(id),
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  stage run_stage not null,
  decision review_decision not null,
  note text,
  reviewer uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger cases_updated_at before update on cases
  for each row execute function set_updated_at();

-- 신규 가입자 → profiles 자동 생성 (기본 member; 최초 admin은 운영자가 SQL로 승격)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 관리자 판별 (RLS에서 사용)
create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- RLS: 단일 팀 — authenticated 전원 읽기/쓰기, 역할 변경만 admin
alter table profiles enable row level security;
alter table cases enable row level security;
alter table rounds enable row level security;
alter table runs enable row level security;
alter table checkpoints enable row level security;
alter table case_files enable row level security;
alter table reviews enable row level security;

create policy "team read profiles" on profiles for select to authenticated using (true);
create policy "self update profile" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from profiles p where p.id = auth.uid()));
create policy "admin update any profile" on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "team all cases" on cases for all to authenticated using (true) with check (true);
create policy "team all rounds" on rounds for all to authenticated using (true) with check (true);
create policy "team all runs" on runs for all to authenticated using (true) with check (true);
create policy "team all checkpoints" on checkpoints for all to authenticated using (true) with check (true);
create policy "team all case_files" on case_files for all to authenticated using (true) with check (true);
create policy "team all reviews" on reviews for all to authenticated using (true) with check (true);

-- Storage: 비공개 버킷
insert into storage.buckets (id, name, public) values ('case-files', 'case-files', false);

create policy "team read case-files" on storage.objects for select to authenticated
  using (bucket_id = 'case-files');
create policy "team write case-files" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-files');
create policy "team update case-files" on storage.objects for update to authenticated
  using (bucket_id = 'case-files');
