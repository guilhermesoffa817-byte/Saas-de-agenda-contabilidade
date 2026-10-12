-- Depois do GoTrue, do shim e das migrações: deixa o banco local com o mesmo
-- contrato que o PostgREST e o GoTrue de verdade esperam no Supabase.
-- Usado só por scripts/supabase-mini.sh (banco de ponta a ponta). NÃO é migração.

-- auth.uid()/role()/jwt() iguais aos do Supabase: o PostgREST 12+ entrega as
-- claims inteiras em request.jwt.claims (JSON); as versões antigas e o shim dos
-- testes de banco usam request.jwt.claim.<nome>. Lê os dois.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text;
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- Como no Supabase: as políticas e funções podem consultar auth.users pelo
-- service_role, e os papéis da API enxergam o schema auth.
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- Sem "grant all on all ..." de propósito: as migrações revogam permissões de
-- algumas funções (0011_seguranca) e isso tem de valer aqui como na nuvem.
grant usage on schema public, extensions, storage to anon, authenticated, service_role;

-- O PostgREST troca para o papel do JWT a partir do authenticator.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;
alter role authenticator with login noinherit password 'authenticator';
grant anon, authenticated, service_role to authenticator;

notify pgrst, 'reload schema';
