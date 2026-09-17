-- Réplica mínima do que o Supabase já oferece no banco dele (papéis, schema auth e
-- privilégios padrão). Serve só para rodar e testar as migrações num Postgres local.
-- NÃO faz parte das migrações e nunca é aplicado no projeto da nuvem.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;

-- No Supabase, as tabelas do schema public já nascem com grant para esses papéis.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null
);

-- auth.uid() do Supabase lê o "sub" do JWT; aqui lê a mesma configuração de sessão.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant select on auth.users to service_role;

-- Storage do Supabase (só o mínimo para as migrações aplicarem num Postgres local).
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- No Supabase, devolve as pastas do caminho do arquivo: "empresa/2026/nota.pdf" -> {empresa,2026}
create or replace function storage.foldername(name text)
returns text[]
language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
$$;

grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;
grant select on storage.objects to authenticated;
