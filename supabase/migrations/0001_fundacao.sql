create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
grant usage on schema private to authenticated;

create type public.member_role as enum ('dono', 'profissional', 'recepcao', 'contador');
create type public.tax_regime as enum ('pf_autonomo', 'mei', 'simples_nacional', 'outro');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  segment text not null default 'outro'
    check (segment in ('salao', 'barbearia', 'clinica', 'consultorio', 'personal', 'terapeuta', 'outro')),
  tax_regime public.tax_regime not null default 'mei',
  document text,                                      -- CPF ou CNPJ, só números
  opened_on date,                                     -- data de abertura (limite proporcional do MEI)
  timezone text not null default 'America/Sao_Paulo',
  city text,
  state char(2),
  pix_key text,
  plan text not null default 'trial' check (plan in ('trial', 'essencial', 'profissional', 'negocio')),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index on public.organization_members (user_id);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,               -- ex.: 'exportacao.livro_caixa', 'cliente.ver_anotacoes', 'fechamento.reaberto'
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Funções auxiliares das políticas (schema privado, fora da API)
create or replace function private.has_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

create or replace function private.is_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

grant execute on function private.has_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.audit_logs enable row level security;

create policy "membros veem a empresa" on public.organizations
  for select to authenticated using (private.is_member(id));
create policy "dono edita a empresa" on public.organizations
  for update to authenticated
  using (private.has_role(id, array['dono']::public.member_role[]))
  with check (private.has_role(id, array['dono']::public.member_role[]));

-- O dono só edita dados cadastrais. Plano, status e teste grátis só mudam pelo servidor.
revoke update on public.organizations from authenticated;
grant update (name, slug, segment, tax_regime, document, opened_on, timezone, city, state, pix_key)
  on public.organizations to authenticated;

create policy "membros veem a equipe" on public.organization_members
  for select to authenticated using (private.is_member(organization_id));
create policy "dono altera papéis" on public.organization_members
  for update to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));
create policy "dono remove membros" on public.organization_members
  for delete to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]));
-- Entradas na equipe só pelas funções create_organization e accept_invite.

create policy "dono gerencia convites" on public.organization_invites
  for all to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));

create policy "dono lê auditoria" on public.audit_logs
  for select to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]));

-- Cria a empresa e coloca quem criou como dono
create or replace function public.create_organization(
  p_name text, p_slug text, p_segment text, p_tax_regime public.tax_regime, p_timezone text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.';
  end if;
  insert into public.organizations (name, slug, segment, tax_regime, timezone)
  values (p_name, p_slug, p_segment, p_tax_regime, p_timezone)
  returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, (select auth.uid()), 'dono');
  return v_org;
end;
$$;

-- Aceita convite (equipe ou contador) com o mesmo e-mail do convite
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.organization_invites;
  v_email text;
begin
  select email into v_email from auth.users where id = (select auth.uid());
  select * into v_inv from public.organization_invites
   where token = p_token and accepted_at is null and expires_at > now();
  if v_inv.id is null then
    raise exception 'Convite inválido ou expirado.';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'Este convite foi enviado para outro e-mail.';
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, (select auth.uid()), v_inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.organization_invites set accepted_at = now() where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text, public.tax_regime, text) from public, anon;
grant execute on function public.create_organization(text, text, text, public.tax_regime, text) to authenticated;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
