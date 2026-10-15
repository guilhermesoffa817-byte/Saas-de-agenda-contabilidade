-- ============================================================================
-- BOSSA — banco de dados completo
--
-- COMO USAR:
--   1. No painel do Supabase, abra "SQL Editor" no menu da esquerda.
--   2. Clique em "New query".
--   3. Cole TUDO deste arquivo (Ctrl+A, Ctrl+C aqui; Ctrl+V lá).
--   4. Clique em "Run".
--
-- Leva alguns segundos. Se aparecer "Success. No rows returned", deu certo:
-- as tabelas, as permissões e as regras de segurança estão criadas.
--
-- Rode UMA VEZ só, num projeto novo. Rodar de novo num banco que já tem as
-- tabelas dá erro de "already exists" — e isso é proteção, não problema.
--
-- Este arquivo é a junção das 15 migrações do projeto, na ordem certa.
-- Gerado por: npm run db:sql
-- A fonte continua sendo supabase/migrations/ — se mudar lá, gere de novo.
-- ============================================================================



-- --------------------------------------------------------------------------
-- 0001_fundacao.sql
-- --------------------------------------------------------------------------

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


-- --------------------------------------------------------------------------
-- 0002_agenda.sql
-- --------------------------------------------------------------------------

create type public.appointment_status as enum ('agendado', 'confirmado', 'concluido', 'faltou', 'cancelado');

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  color text not null default '#0F3D2E',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  duration_min int not null check (duration_min between 5 and 600),
  buffer_min int not null default 0 check (buffer_min between 0 and 120), -- preparo/limpeza após o atendimento
  price_cents bigint not null check (price_cents >= 0),
  bookable_online boolean not null default true,
  active boolean not null default true
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone_e164 text,                    -- +5566999999999
  email text,
  document text,                      -- CPF opcional (necessário para recibos e notas)
  payer_type text not null default 'pf' check (payer_type in ('pf', 'pj')),
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  notes text,                         -- anotações administrativas. NÃO é prontuário.
  no_show_count int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, phone_e164)
);

create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id),
  client_id uuid not null references public.clients(id),
  service_id uuid not null references public.services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,       -- já inclui o buffer do serviço
  status public.appointment_status not null default 'agendado',
  price_cents bigint not null check (price_cents >= 0),
  source text not null default 'interno' check (source in ('interno', 'link_publico')),
  confirmed_at timestamptz,
  reminder_sent_at timestamptz,
  cancel_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- O banco impede dois atendimentos ativos no mesmo horário do mesmo profissional
  constraint sem_conflito_de_horario exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('agendado', 'confirmado'))
);
create index on public.appointments (organization_id, starts_at);

do $$
declare t text;
begin
  foreach t in array array['professionals', 'services', 'clients', 'working_hours', 'time_off', 'appointments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "equipe lê" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['clients', 'appointments', 'time_off'] loop
    execute format($p$create policy "equipe escreve" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['professionals', 'services', 'working_hours'] loop
    execute format($p$create policy "dono configura" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono']::public.member_role[]))$p$, t);
  end loop;
end $$;


-- --------------------------------------------------------------------------
-- 0003_agenda_extras.sql
-- --------------------------------------------------------------------------

-- Extras da agenda que a aplicação precisa fazer numa só transação.

-- "Faltou" muda o atendimento e soma no contador de faltas do cliente.
-- Fica no banco para o número nunca sair errado por duas telas somando ao mesmo tempo.
create or replace function public.marcar_falta(p_appointment uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_client uuid;
  v_status public.appointment_status;
begin
  select organization_id, client_id, status
    into v_org, v_client, v_status
    from public.appointments
   where id = p_appointment;

  if v_org is null then
    raise exception 'Atendimento não encontrado.';
  end if;

  if not private.has_role(v_org, array['dono', 'recepcao', 'profissional']::public.member_role[]) then
    raise exception 'Sem permissão para alterar este atendimento.';
  end if;

  if v_status = 'faltou' then
    return; -- já marcado: não soma duas vezes
  end if;

  update public.appointments set status = 'faltou' where id = p_appointment;
  update public.clients set no_show_count = no_show_count + 1 where id = v_client;
end;
$$;

revoke execute on function public.marcar_falta(uuid) from public, anon;
grant execute on function public.marcar_falta(uuid) to authenticated;

-- Consultas da agenda por profissional e faixa de horário.
create index if not exists appointments_professional_starts_at_idx
  on public.appointments (professional_id, starts_at);

create index if not exists time_off_professional_starts_at_idx
  on public.time_off (professional_id, starts_at);

create index if not exists working_hours_professional_weekday_idx
  on public.working_hours (professional_id, weekday);

-- Busca de cliente por nome dentro da empresa.
create index if not exists clients_organization_name_idx
  on public.clients (organization_id, name);


-- --------------------------------------------------------------------------
-- 0004_agendamento_publico.sql
-- --------------------------------------------------------------------------

-- Registro das tentativas de agendamento pelo link público.
-- Serve para limitar abuso por IP e por telefone. Só o servidor (chave secreta)
-- escreve e lê: a tabela tem RLS ligada e nenhuma política.

create table if not exists public.booking_attempts (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  ip_hash text not null,
  phone_e164 text,
  sucesso boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists booking_attempts_ip_idx on public.booking_attempts (ip_hash, created_at desc);
create index if not exists booking_attempts_phone_idx on public.booking_attempts (phone_e164, created_at desc);
create index if not exists booking_attempts_created_idx on public.booking_attempts (created_at);

alter table public.booking_attempts enable row level security;

-- Limpeza: chamada pela tarefa agendada (FASE 8). Guardar 7 dias é suficiente.
create or replace function public.limpar_tentativas_antigas()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_apagadas integer;
begin
  delete from public.booking_attempts where created_at < now() - interval '7 days';
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

revoke execute on function public.limpar_tentativas_antigas() from public, anon, authenticated;


-- --------------------------------------------------------------------------
-- 0005_financeiro.sql
-- --------------------------------------------------------------------------

create type public.tx_kind as enum ('receita', 'despesa');
create type public.tx_status as enum ('pendente', 'pago', 'cancelado');
create type public.payment_method as enum
  ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'banco' check (type in ('caixa', 'banco', 'maquininha')),
  accounting_code text,               -- código no plano de contas do contador
  active boolean not null default true
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind public.tx_kind not null,
  report_group text not null default 'operacional'
    check (report_group in ('operacional', 'imposto', 'financeiro', 'retirada')),
  deductible_hint boolean not null default false,  -- sugestão para o Livro-Caixa; o contador confirma
  accounting_code text,
  unique (organization_id, name, kind)
);

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  totals jsonb not null default '{}',
  package_path text,                  -- pacote de relatórios no Storage
  unique (organization_id, month)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.tx_kind not null,
  status public.tx_status not null default 'pago',
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  competence_date date not null,      -- mês a que pertence (competência)
  due_date date,
  paid_at date,                       -- data do pagamento (caixa; usada no Livro-Caixa)
  payment_method public.payment_method,
  category_id uuid references public.categories(id),
  account_id uuid references public.accounts(id),
  appointment_id uuid unique references public.appointments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  payer_type text check (payer_type in ('pf', 'pj')),
  revenue_type text not null default 'servico' check (revenue_type in ('servico', 'revenda', 'industrializado')),
  nota_fiscal_emitida boolean not null default false,
  receita_saude_emitido boolean not null default false,
  attachment_path text,               -- comprovante no bucket privado
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (status <> 'pago' or paid_at is not null)
);
create index on public.transactions (organization_id, paid_at);
create index on public.transactions (organization_id, competence_date);

-- Contas e categorias padrão (empresas novas e as que já existem)
create or replace function private.criar_padroes_para(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.accounts (organization_id, name, type) values
    (p_org, 'Caixa', 'caixa'),
    (p_org, 'Conta bancária', 'banco');
  insert into public.categories (organization_id, name, kind, report_group, deductible_hint) values
    (p_org, 'Atendimentos', 'receita', 'operacional', false),
    (p_org, 'Venda de produtos', 'receita', 'operacional', false),
    (p_org, 'Outras receitas', 'receita', 'operacional', false),
    (p_org, 'Aluguel do espaço', 'despesa', 'operacional', true),
    (p_org, 'Energia, água e internet', 'despesa', 'operacional', true),
    (p_org, 'Materiais e insumos', 'despesa', 'operacional', true),
    (p_org, 'Salários e encargos', 'despesa', 'operacional', true),
    (p_org, 'Conselho de classe e sindicato', 'despesa', 'operacional', true),
    (p_org, 'Cursos, congressos e publicações', 'despesa', 'operacional', true),
    (p_org, 'Marketing', 'despesa', 'operacional', false),
    (p_org, 'Taxas de maquininha e bancárias', 'despesa', 'financeiro', false),
    (p_org, 'Impostos (DAS, ISS, Carnê-Leão)', 'despesa', 'imposto', false),
    (p_org, 'Retirada do dono', 'despesa', 'retirada', false),
    (p_org, 'Outras despesas', 'despesa', 'operacional', false)
  on conflict (organization_id, name, kind) do nothing;
end;
$$;

create or replace function private.trg_criar_padroes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.criar_padroes_para(new.id);
  return new;
end;
$$;

create trigger trg_padroes_financeiros
  after insert on public.organizations
  for each row execute function private.trg_criar_padroes();

select private.criar_padroes_para(id) from public.organizations; -- empresas criadas nas fases anteriores

-- Mês fechado não aceita inclusão, edição nem exclusão de lançamentos
create or replace function private.bloquear_mes_fechado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_meses date[] := '{}';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_org := new.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(new.paid_at, new.competence_date)::timestamp)::date;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_org := old.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(old.paid_at, old.competence_date)::timestamp)::date;
  end if;
  if exists (
    select 1 from public.monthly_closings c
    where c.organization_id = v_org and c.reopened_at is null and c.month = any (v_meses)
  ) then
    raise exception 'Mês fechado: reabra o fechamento para alterar este lançamento.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_bloquear_mes_fechado
  before insert or update or delete on public.transactions
  for each row execute function private.bloquear_mes_fechado();

do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'monthly_closings'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['accounts', 'categories'] loop
    execute format($p$create policy "leitura" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'contador', 'recepcao']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['transactions', 'monthly_closings'] loop
    execute format($p$create policy "dono e contador leem" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['accounts', 'categories', 'transactions'] loop
    execute format($p$create policy "dono escreve" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono']::public.member_role[]))$p$, t);
  end loop;
end $$;

create policy "recepção registra recebimentos" on public.transactions
  for insert to authenticated
  with check (kind = 'receita' and private.has_role(organization_id, array['recepcao']::public.member_role[]));

-- Conclui o atendimento e lança o recebimento numa única operação
create or replace function public.concluir_atendimento(
  p_appointment uuid, p_metodo public.payment_method, p_valor_cents bigint, p_conta uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ag public.appointments;
  v_tz text;
  v_cat uuid;
  v_tx uuid;
begin
  select * into v_ag from public.appointments where id = p_appointment for update;
  if v_ag.id is null then
    raise exception 'Agendamento não encontrado.';
  end if;
  if not private.has_role(v_ag.organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_ag.status in ('concluido', 'cancelado') then
    raise exception 'Este atendimento não pode mais ser concluído.';
  end if;
  if p_valor_cents <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  if p_conta is not null and not exists (
    select 1 from public.accounts where id = p_conta and organization_id = v_ag.organization_id
  ) then
    raise exception 'Conta inválida.';
  end if;

  select timezone into v_tz from public.organizations where id = v_ag.organization_id;
  select id into v_cat from public.categories
   where organization_id = v_ag.organization_id and kind = 'receita' and name = 'Atendimentos';

  update public.appointments set status = 'concluido' where id = p_appointment;

  insert into public.transactions (
    organization_id, kind, status, description, amount_cents, competence_date, paid_at,
    payment_method, category_id, account_id, appointment_id, client_id, payer_type, created_by
  )
  select v_ag.organization_id, 'receita', 'pago', s.name || ' — ' || c.name, p_valor_cents,
         (v_ag.starts_at at time zone v_tz)::date, (now() at time zone v_tz)::date,
         p_metodo, v_cat, p_conta, v_ag.id, c.id, c.payer_type, (select auth.uid())
    from public.services s
    join public.clients c on c.id = v_ag.client_id
   where s.id = v_ag.service_id
  returning id into v_tx;

  return v_tx;
end;
$$;

revoke execute on function public.concluir_atendimento(uuid, public.payment_method, bigint, uuid) from public, anon;
grant execute on function public.concluir_atendimento(uuid, public.payment_method, bigint, uuid) to authenticated;

-- Comprovantes: bucket privado, primeira pasta do caminho = id da empresa
insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

create policy "comprovantes: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['dono', 'recepcao', 'contador']::public.member_role[]));
create policy "comprovantes: envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['dono', 'recepcao']::public.member_role[]));


-- --------------------------------------------------------------------------
-- 0006_fechamento.sql
-- --------------------------------------------------------------------------

-- supabase/migrations/0006_fechamento.sql
create or replace function public.fechar_mes(p_org uuid, p_mes date)
returns public.monthly_closings
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes::timestamp)::date;
  v_row public.monthly_closings;
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Apenas o dono pode fechar o mês.';
  end if;
  insert into public.monthly_closings (organization_id, month, closed_by, totals)
  select p_org, v_mes, (select auth.uid()), jsonb_build_object(
    'receitas_cents', coalesce(sum(t.amount_cents) filter (where t.kind = 'receita'), 0),
    'despesas_cents', coalesce(sum(t.amount_cents) filter (where t.kind = 'despesa'), 0),
    'lancamentos', count(*)
  )
  from public.transactions t
  where t.organization_id = p_org
    and t.status = 'pago'
    and t.paid_at >= v_mes
    and t.paid_at < (v_mes + interval '1 month')
  on conflict (organization_id, month) do update
    set closed_at = now(), closed_by = excluded.closed_by, reopened_at = null, totals = excluded.totals
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.reabrir_mes(p_org uuid, p_mes date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Apenas o dono pode reabrir o mês.';
  end if;
  update public.monthly_closings
     set reopened_at = now()
   where organization_id = p_org and month = date_trunc('month', p_mes::timestamp)::date;
  insert into public.audit_logs (organization_id, user_id, action, metadata)
  values (p_org, (select auth.uid()), 'fechamento.reaberto', jsonb_build_object('mes', p_mes));
end;
$$;

-- O contador só pode mexer no código contábil, nada mais
create or replace function public.definir_codigo_contabil(p_categoria uuid, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.categories where id = p_categoria;
  if v_org is null or not private.has_role(v_org, array['dono', 'contador']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  update public.categories set accounting_code = nullif(trim(p_codigo), '') where id = p_categoria;
end;
$$;

revoke execute on function public.fechar_mes(uuid, date) from public, anon;
grant execute on function public.fechar_mes(uuid, date) to authenticated;
revoke execute on function public.reabrir_mes(uuid, date) from public, anon;
grant execute on function public.reabrir_mes(uuid, date) to authenticated;
revoke execute on function public.definir_codigo_contabil(uuid, text) from public, anon;
grant execute on function public.definir_codigo_contabil(uuid, text) to authenticated;

-- O contador precisa do nome e do CPF do pagador para o Livro-Caixa e para os
-- recibos, mas não pode ver telefone nem anotações (minimização da LGPD).
-- A visão roda com os privilégios do dono dela e faz a checagem de papel aqui.
create or replace view public.clientes_para_contabilidade
with (security_invoker = off) as
select c.id, c.organization_id, c.name, c.document, c.payer_type
  from public.clients c
 where c.deleted_at is null
   and private.has_role(c.organization_id, array['dono', 'contador']::public.member_role[]);

revoke all on public.clientes_para_contabilidade from public, anon;
grant select on public.clientes_para_contabilidade to authenticated;

-- Pedido de comprovante: o contador pede, o dono responde.
create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  requested_by uuid references auth.users(id),
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists document_requests_org_idx
  on public.document_requests (organization_id, created_at desc);

alter table public.document_requests enable row level security;

create policy "dono e contador leem pedidos" on public.document_requests
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

create policy "contador pede comprovante" on public.document_requests
  for insert to authenticated
  with check (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

create policy "dono resolve pedido" on public.document_requests
  for update to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));

-- Modelo de exportação contábil por empresa, definido pelo contador.
create table if not exists public.export_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Padrão',
  columns text[] not null default array['data', 'historico', 'valor', 'conta_debito', 'conta_credito'],
  separator text not null default ';' check (separator in (';', ',', '|', '\t')),
  date_format text not null default 'dd/MM/yyyy'
    check (date_format in ('dd/MM/yyyy', 'yyyy-MM-dd', 'ddMMyyyy')),
  decimal_comma boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.export_templates enable row level security;

create policy "dono e contador leem modelos" on public.export_templates
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

create policy "dono e contador ajustam modelos" on public.export_templates
  for all to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

-- Pacotes de fechamento: bucket privado, primeira pasta do caminho = id da empresa.
insert into storage.buckets (id, name, public) values ('fechamentos', 'fechamentos', false)
on conflict (id) do nothing;

create policy "fechamentos: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'fechamentos'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['dono', 'contador']::public.member_role[]));

create policy "fechamentos: envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'fechamentos'
    and private.has_role(((storage.foldername(name))[1])::uuid, array['dono']::public.member_role[]));


-- --------------------------------------------------------------------------
-- 0007_assinatura.sql
-- --------------------------------------------------------------------------

-- supabase/migrations/0007_assinatura.sql
alter table public.organizations
  add column asaas_customer_id text,
  add column asaas_subscription_id text,
  add column billing_cycle text check (billing_cycle in ('mensal', 'anual')),
  add column pending_plan text check (pending_plan in ('essencial', 'profissional', 'negocio')),
  add column referred_by_accountant uuid references auth.users(id);

create table public.billing_events (
  id text primary key,                -- id do evento do Asaas (idempotência)
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security; -- sem políticas: só o servidor acessa

-- Aplicar o resultado da cobrança fica no banco, numa função só, para o webhook
-- não precisar de vários passos e o plano nunca ficar pela metade.
create or replace function private.aplicar_status_de_cobranca(
  p_assinatura text, p_status text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org record;
begin
  select id, plan, pending_plan into v_org
    from public.organizations
   where asaas_subscription_id = p_assinatura;

  if v_org.id is null then
    return null;
  end if;

  if p_status = 'active' then
    update public.organizations
       set subscription_status = 'active',
           plan = coalesce(v_org.pending_plan, v_org.plan),
           pending_plan = null
     where id = v_org.id;
  else
    update public.organizations
       set subscription_status = p_status
     where id = v_org.id;
  end if;

  return v_org.id;
end;
$$;

revoke execute on function private.aplicar_status_de_cobranca(text, text) from public, anon, authenticated;

-- O dono cuida do cadastro; cobrança é só do servidor.
revoke update on public.organizations from authenticated;
grant update (name, slug, segment, tax_regime, document, opened_on, timezone, city, state, pix_key)
  on public.organizations to authenticated;

-- Índice para o webhook achar a empresa pela assinatura.
create index if not exists organizations_asaas_subscription_idx
  on public.organizations (asaas_subscription_id);


-- --------------------------------------------------------------------------
-- 0008_assinatura_extras.sql
-- --------------------------------------------------------------------------

-- A regra de acesso fala em "atrasado há mais de 5 dias", então a data em que o
-- atraso começou precisa existir.
alter table public.organizations
  add column if not exists past_due_since timestamptz,
  add column if not exists canceled_at timestamptz;

create or replace function private.aplicar_status_de_cobranca(
  p_assinatura text, p_status text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org record;
begin
  select id, plan, pending_plan, subscription_status, past_due_since into v_org
    from public.organizations
   where asaas_subscription_id = p_assinatura;

  if v_org.id is null then
    return null;
  end if;

  if p_status = 'active' then
    update public.organizations
       set subscription_status = 'active',
           plan = coalesce(v_org.pending_plan, v_org.plan),
           pending_plan = null,
           past_due_since = null,
           canceled_at = null
     where id = v_org.id;

  elsif p_status = 'past_due' then
    update public.organizations
       set subscription_status = 'past_due',
           -- não reinicia a contagem em cada aviso de atraso
           past_due_since = coalesce(v_org.past_due_since, now())
     where id = v_org.id;

  elsif p_status = 'canceled' then
    update public.organizations
       set subscription_status = 'canceled',
           canceled_at = coalesce(v_org.canceled_at, now())
     where id = v_org.id;

  else
    update public.organizations set subscription_status = p_status where id = v_org.id;
  end if;

  return v_org.id;
end;
$$;

revoke execute on function private.aplicar_status_de_cobranca(text, text) from public, anon, authenticated;


-- --------------------------------------------------------------------------
-- 0009_webhook_cobranca.sql
-- --------------------------------------------------------------------------

-- O webhook usa a chave secreta (papel service_role) e chama pela API, que só
-- alcança funções do schema public. Esta é a porta: nada de anon nem de usuário
-- logado, só o servidor.
create or replace function public.aplicar_status_de_cobranca(
  p_assinatura text, p_status text
) returns uuid
language sql security definer set search_path = ''
as $$
  select private.aplicar_status_de_cobranca(p_assinatura, p_status);
$$;

revoke execute on function public.aplicar_status_de_cobranca(text, text) from public, anon, authenticated;
grant execute on function public.aplicar_status_de_cobranca(text, text) to service_role;


-- --------------------------------------------------------------------------
-- 0010_integracoes.sql
-- --------------------------------------------------------------------------

-- FASE 7 — Integrações: WhatsApp oficial, NFS-e e agenda no celular.

-- ---------------------------------------------------------------------------
-- Registro de tudo que sai pelo WhatsApp. Serve para auditoria, para a franquia
-- do plano e para o cliente provar que o lembrete foi enviado.
-- ---------------------------------------------------------------------------
create table public.message_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  channel text not null default 'whatsapp',
  template text not null,
  provider_message_id text,
  status text not null default 'enviado' check (status in ('enviado', 'entregue', 'lido', 'falhou')),
  error text,
  created_at timestamptz not null default now()
);

create index message_logs_org_mes on public.message_logs (organization_id, created_at desc);
create index message_logs_agendamento on public.message_logs (appointment_id);
-- O webhook da Meta chega com o id da mensagem dela: é por aqui que a gente acha o envio.
create unique index message_logs_provider on public.message_logs (provider_message_id)
  where provider_message_id is not null;

alter table public.message_logs enable row level security;

create policy "dono e recepção leem envios" on public.message_logs
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'recepcao']::public.member_role[]));

-- Quem escreve aqui é o servidor (cron e webhook), com a chave secreta.
revoke insert, update, delete on public.message_logs from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Agenda no celular: cada profissional tem um endereço secreto de assinatura.
-- ---------------------------------------------------------------------------
alter table public.professionals
  add column ical_token text unique default replace(gen_random_uuid()::text, '-', '');

update public.professionals
  set ical_token = replace(gen_random_uuid()::text, '-', '')
  where ical_token is null;

alter table public.professionals alter column ical_token set not null;

-- O token é um segredo: quem tem o endereço lê a agenda. Só o dono troca o seu,
-- e ninguém escolhe o valor — a função sorteia. Revogar coluna a coluna não
-- adianta enquanto existir o update da tabela inteira: tira-se o update e
-- devolve-se só o que a equipe realmente edita.
revoke update on public.professionals from authenticated, anon;
grant update (user_id, name, color, active) on public.professionals to authenticated;

create or replace function public.gerar_token_ical(p_profissional uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_token text;
begin
  select organization_id into v_org from public.professionals where id = p_profissional;
  if v_org is null then
    raise exception 'Profissional não encontrado.';
  end if;
  if not private.has_role(v_org, array['dono']::public.member_role[]) then
    raise exception 'Só o dono troca o link da agenda.';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.professionals set ical_token = v_token where id = p_profissional;
  return v_token;
end;
$$;

revoke execute on function public.gerar_token_ical(uuid) from public, anon;
grant execute on function public.gerar_token_ical(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- NFS-e: o contador configura os códigos por serviço. O Alicerce não calcula
-- imposto nenhum — ele só repassa ao provedor o que foi configurado aqui.
-- ---------------------------------------------------------------------------
create table public.service_tax_codes (
  service_id uuid primary key references public.services(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Código do serviço na lista da LC 116 e o código municipal, quando a prefeitura exige.
  lc116_code text,
  city_service_code text,
  cnae text,
  -- Texto que sai na nota. Quem escreve é quem entende: o contador.
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.service_tax_codes enable row level security;

create policy "equipe do escritório lê os códigos" on public.service_tax_codes
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

create policy "dono e contador configuram os códigos" on public.service_tax_codes
  for all to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

-- A nota de cada recebimento. Uma linha por tentativa de emissão.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  provider text not null,
  provider_invoice_id text,
  status text not null default 'processando'
    check (status in ('processando', 'emitida', 'erro', 'cancelada')),
  numero text,
  codigo_verificacao text,
  xml_path text,
  pdf_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_org on public.invoices (organization_id, created_at desc);
create index invoices_lancamento on public.invoices (transaction_id);
create unique index invoices_provider on public.invoices (provider, provider_invoice_id)
  where provider_invoice_id is not null;

alter table public.invoices enable row level security;

create policy "dono e contador leem as notas" on public.invoices
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

-- Quem emite é o servidor, falando com o provedor. Ninguém inventa nota pelo cliente.
revoke insert, update, delete on public.invoices from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Porta do servidor para aplicar o resultado que o provedor manda pelo webhook.
-- ---------------------------------------------------------------------------
create or replace function private.aplicar_resultado_da_nota(
  p_provedor text,
  p_id_no_provedor text,
  p_status text,
  p_numero text default null,
  p_codigo text default null,
  p_xml text default null,
  p_pdf text default null,
  p_erro text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nota public.invoices;
begin
  select * into v_nota from public.invoices
    where provider = p_provedor and provider_invoice_id = p_id_no_provedor;

  if v_nota.id is null then
    return null; -- webhook de nota que não é nossa: ignora em silêncio.
  end if;

  update public.invoices set
    status = p_status,
    numero = coalesce(p_numero, numero),
    codigo_verificacao = coalesce(p_codigo, codigo_verificacao),
    xml_path = coalesce(p_xml, xml_path),
    pdf_path = coalesce(p_pdf, pdf_path),
    error = p_erro,
    updated_at = now()
  where id = v_nota.id;

  -- A marca no lançamento é o que o dono vê na tela do financeiro.
  update public.transactions
    set nota_fiscal_emitida = (p_status = 'emitida')
    where id = v_nota.transaction_id;

  return v_nota.id;
end;
$$;

create or replace function public.aplicar_resultado_da_nota(
  p_provedor text,
  p_id_no_provedor text,
  p_status text,
  p_numero text default null,
  p_codigo text default null,
  p_xml text default null,
  p_pdf text default null,
  p_erro text default null
) returns uuid
language sql security definer set search_path = ''
as $$
  select private.aplicar_resultado_da_nota(
    p_provedor, p_id_no_provedor, p_status, p_numero, p_codigo, p_xml, p_pdf, p_erro
  );
$$;

revoke execute on function public.aplicar_resultado_da_nota(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.aplicar_resultado_da_nota(text, text, text, text, text, text, text, text)
  to service_role;

-- Guarda o XML e o PDF da nota. Privado: só o servidor grava, só quem tem
-- link assinado lê.
insert into storage.buckets (id, name, public)
  values ('notas', 'notas', false)
  on conflict (id) do nothing;


-- --------------------------------------------------------------------------
-- 0011_seguranca.sql
-- --------------------------------------------------------------------------

-- FASE 8 — Segurança e LGPD.

-- ---------------------------------------------------------------------------
-- Limite de tentativas nos endpoints públicos de conta.
--
-- O Supabase Auth já tem limite próprio, mas ele é por projeto e genérico.
-- Este aqui é nosso: conta tentativa por e-mail e por IP embaralhado, e
-- responde a mesma coisa para e-mail que existe e que não existe — senão o
-- contador de tentativas vira um jeito de descobrir quem tem conta.
-- ---------------------------------------------------------------------------
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('entrar', 'cadastro', 'recuperar')),
  email_hash text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index auth_attempts_email_idx on public.auth_attempts (email_hash, created_at desc);
create index auth_attempts_ip_idx on public.auth_attempts (ip_hash, created_at desc);
create index auth_attempts_created_idx on public.auth_attempts (created_at);

alter table public.auth_attempts enable row level security;
-- Ninguém logado lê nem escreve: isto é só do servidor, com a chave secreta.
revoke all on public.auth_attempts from authenticated, anon;

/**
 * Registra a tentativa e diz se passou do limite na janela.
 * Devolve `true` quando ainda pode tentar.
 */
create or replace function private.registrar_tentativa(
  p_kind text,
  p_email_hash text,
  p_ip_hash text,
  p_limite_email int default 8,
  p_limite_ip int default 20,
  p_janela interval default interval '15 minutes'
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_por_email int;
  v_por_ip int;
begin
  insert into public.auth_attempts (kind, email_hash, ip_hash)
  values (p_kind, p_email_hash, p_ip_hash);

  select count(*) into v_por_email from public.auth_attempts
   where kind = p_kind and email_hash is not null and email_hash = p_email_hash
     and created_at > now() - p_janela;

  select count(*) into v_por_ip from public.auth_attempts
   where kind = p_kind and ip_hash is not null and ip_hash = p_ip_hash
     and created_at > now() - p_janela;

  return v_por_email <= p_limite_email and v_por_ip <= p_limite_ip;
end;
$$;

create or replace function public.registrar_tentativa(
  p_kind text,
  p_email_hash text,
  p_ip_hash text
) returns boolean
language sql security definer set search_path = ''
as $$
  select private.registrar_tentativa(p_kind, p_email_hash, p_ip_hash);
$$;

revoke execute on function public.registrar_tentativa(text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_tentativa(text, text, text) to service_role;

create or replace function public.limpar_tentativas_de_conta()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.auth_attempts where created_at < now() - interval '7 days';
$$;

revoke execute on function public.limpar_tentativas_de_conta() from public, anon, authenticated;
grant execute on function public.limpar_tentativas_de_conta() to service_role;

-- ---------------------------------------------------------------------------
-- LGPD: anonimizar cliente sem perder o histórico financeiro.
--
-- O direito do titular é apagar o dado pessoal dele. O dever do negócio é
-- guardar o registro financeiro pelo prazo que o contador indicar. Os dois
-- convivem: o atendimento e o lançamento continuam, sem nome, sem telefone,
-- sem e-mail, sem CPF e sem anotação.
-- ---------------------------------------------------------------------------
create or replace function private.anonimizar_cliente(p_cliente uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.clients where id = p_cliente;
  if v_org is null then
    raise exception 'Cliente não encontrado.';
  end if;
  if not private.has_role(v_org, array['dono']::public.member_role[]) then
    raise exception 'Só o dono apaga os dados de um cliente.';
  end if;

  update public.clients set
    name = 'Cliente removido',
    phone_e164 = null,
    email = null,
    document = null,
    notes = null,
    whatsapp_opt_in = false,
    whatsapp_opt_in_at = null,
    deleted_at = now()
  where id = p_cliente;

  -- O histórico de envios perde o vínculo com a pessoa, mas continua contando
  -- para auditoria e franquia.
  update public.message_logs set appointment_id = null
   where appointment_id in (select id from public.appointments where client_id = p_cliente);

  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
  values (
    v_org, auth.uid(), 'anonimizar_cliente', 'clients', p_cliente,
    jsonb_build_object('motivo', 'pedido do titular (LGPD)')
  );

  return p_cliente;
end;
$$;

create or replace function public.anonimizar_cliente(p_cliente uuid)
returns uuid
language sql security definer set search_path = ''
as $$
  select private.anonimizar_cliente(p_cliente);
$$;

revoke execute on function public.anonimizar_cliente(uuid) from public, anon;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Quem abriu as anotações de um cliente fica registrado. Anotação é o campo
-- mais sensível do sistema, mesmo não sendo prontuário.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_leitura_de_anotacao(p_cliente uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.clients where id = p_cliente;
  if v_org is null then return; end if;
  if not private.is_member(v_org) then
    raise exception 'Cliente de outra empresa.';
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
  values (v_org, auth.uid(), 'ler_anotacao', 'clients', p_cliente, '{}'::jsonb);
end;
$$;

revoke execute on function public.registrar_leitura_de_anotacao(uuid) from public, anon;
grant execute on function public.registrar_leitura_de_anotacao(uuid) to authenticated;


-- --------------------------------------------------------------------------
-- 0012_documentos_do_mes_fechado.sql
-- --------------------------------------------------------------------------

-- Marcar documento emitido não é mexer no dinheiro do mês.
--
-- O mês fechado trava o lançamento, e isso está certo: valor, data, categoria e
-- conta não mudam mais. Mas emitir a nota ou o recibo do Receita Saúde acontece
-- depois — às vezes semanas depois — e marcar isso não altera nenhum número do
-- fechamento. Sem essa brecha, o profissional teria de reabrir o mês só para
-- dizer "já emiti", o que é pior para todo mundo.
create or replace function private.bloquear_mes_fechado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_meses date[] := '{}';
begin
  -- Só as marcações de documento mudaram? Então passa: nada do fechamento muda.
  if tg_op = 'UPDATE' and tg_table_name = 'transactions' then
    if (new.nota_fiscal_emitida is distinct from old.nota_fiscal_emitida
        or new.receita_saude_emitido is distinct from old.receita_saude_emitido)
       and new.organization_id = old.organization_id
       and new.kind = old.kind
       and new.status = old.status
       and new.amount_cents = old.amount_cents
       and new.competence_date = old.competence_date
       and new.paid_at is not distinct from old.paid_at
       and new.due_date is not distinct from old.due_date
       and new.category_id is not distinct from old.category_id
       and new.account_id is not distinct from old.account_id
       and new.payment_method is not distinct from old.payment_method
       and new.description = old.description
       and new.client_id is not distinct from old.client_id
       and new.payer_type is not distinct from old.payer_type
       and new.revenue_type = old.revenue_type
    then
      return new;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_org := new.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(new.paid_at, new.competence_date)::timestamp)::date;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_org := old.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(old.paid_at, old.competence_date)::timestamp)::date;
  end if;
  if exists (
    select 1 from public.monthly_closings c
    where c.organization_id = v_org and c.reopened_at is null and c.month = any (v_meses)
  ) then
    raise exception 'Mês fechado: reabra o fechamento para alterar este lançamento.';
  end if;
  return coalesce(new, old);
end;
$$;


-- --------------------------------------------------------------------------
-- 0013_pessoas.sql
-- --------------------------------------------------------------------------

-- Gestão de pessoas: quem trabalha no negócio, o que foi combinado, ausências e
-- o que foi pago a cada um.
--
-- O Bossa NÃO faz folha de pagamento: não calcula salário líquido, INSS, FGTS,
-- férias nem rescisão. O dono digita o que pagou (a partir do holerite ou da guia
-- que o contador mandou) e o pagamento vira despesa no financeiro, numa tacada só.
--
-- Dados pessoais ficam no mínimo: nome, cargo, vínculo e datas na tabela
-- principal; CPF, Pix e contato numa tabela à parte, que só o dono lê. Atestado
-- entra só como período e tipo — sem campo de observação, porque saúde é dado
-- sensível (LGPD art. 11).

create type public.staff_contract as enum ('clt', 'parceria', 'mei', 'pj', 'autonomo', 'estagio');
create type public.staff_absence_kind as enum
  ('ferias', 'recesso', 'folga', 'atestado', 'licenca', 'falta', 'indisponivel');
create type public.staff_payment_kind as enum
  ('salario', 'comissao', 'cota_parte', 'repasse', 'bolsa', 'adiantamento', 'bonus',
   'beneficio', 'encargo', 'rescisao', 'outro');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null, -- liga à agenda
  name text not null check (char_length(btrim(name)) between 2 and 120),
  job_title text check (job_title is null or char_length(job_title) <= 80),
  contract public.staff_contract not null,
  started_on date not null,
  ended_on date,
  -- Salário, bolsa ou valor fixo mensal combinado.
  base_pay_cents bigint not null default 0 check (base_pay_cents >= 0),
  -- Percentual sobre os atendimentos recebidos (comissão CLT, cota-parte do
  -- parceiro, repasse), em pontos-base: 4000 = 40%.
  commission_bps integer not null default 0 check (commission_bps between 0 and 10000),
  -- Valor fixo por atendimento.
  per_service_cents bigint not null default 0 check (per_service_cents >= 0),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
create index staff_members_org_idx on public.staff_members (organization_id, name);
create unique index staff_members_professional_idx on public.staff_members (organization_id, professional_id)
  where professional_id is not null;

create table public.staff_private (
  staff_id uuid primary key references public.staff_members(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'), -- CPF ou CNPJ, só dígitos
  pix_key text check (pix_key is null or char_length(pix_key) <= 140),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (char_length(email) <= 254 and email like '%_@_%')),
  notes text check (notes is null or char_length(notes) <= 1000)
);
create index staff_private_org_idx on public.staff_private (organization_id);

create table public.staff_absences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  kind public.staff_absence_kind not null,
  starts_on date not null,
  ends_on date not null,
  -- Bloqueio criado na agenda, quando o colaborador atende (motivo sempre "Ausência").
  time_off_id uuid references public.time_off(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index staff_absences_staff_idx on public.staff_absences (staff_id, starts_on desc);
create index staff_absences_org_idx on public.staff_absences (organization_id, starts_on desc);

create table public.staff_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  kind public.staff_payment_kind not null,
  reference_month date not null check (extract(day from reference_month) = 1),
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null,
  -- Apagar o lançamento no financeiro apaga o pagamento junto.
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index staff_payments_staff_idx on public.staff_payments (staff_id, reference_month desc);
create index staff_payments_org_idx on public.staff_payments (organization_id, reference_month desc);

-- ---------------------------------------------------------------------------
-- Vocabulário por vínculo.
--
-- Registrar férias, falta ou "salário" de quem não é empregado produz prova de
-- subordinação contra o próprio dono. Por isso o banco recusa a combinação
-- errada, e a tela só oferece as palavras certas para cada vínculo.
-- ---------------------------------------------------------------------------
create or replace function private.ausencia_permitida(
  p_contrato public.staff_contract, p_tipo public.staff_absence_kind
) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_contrato
    when 'clt' then p_tipo in ('ferias', 'folga', 'atestado', 'licenca', 'falta')
    when 'estagio' then p_tipo in ('recesso', 'folga', 'atestado', 'falta')
    else p_tipo = 'indisponivel'
  end;
$$;

create or replace function private.pagamento_permitido(
  p_contrato public.staff_contract, p_tipo public.staff_payment_kind
) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_contrato
    when 'clt' then p_tipo in ('salario', 'comissao', 'adiantamento', 'bonus', 'beneficio',
                               'encargo', 'rescisao', 'outro')
    when 'estagio' then p_tipo in ('bolsa', 'beneficio', 'outro')
    when 'parceria' then p_tipo in ('cota_parte', 'outro')
    else p_tipo in ('repasse', 'outro')
  end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos de consistência: tudo da mesma empresa, vocabulário certo.
-- ---------------------------------------------------------------------------
create or replace function private.conferir_colaborador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'O colaborador não pode mudar de empresa.';
  end if;
  if tg_op = 'UPDATE' and old.anonymized_at is not null then
    raise exception 'Este colaborador foi removido e não pode ser editado.';
  end if;
  if new.professional_id is not null and not exists (
    select 1 from public.professionals p
     where p.id = new.professional_id and p.organization_id = new.organization_id
  ) then
    raise exception 'Profissional de outra empresa.';
  end if;
  return new;
end;
$$;

create trigger trg_conferir_colaborador
  before insert or update on public.staff_members
  for each row execute function private.conferir_colaborador();

create or replace function private.conferir_dado_do_colaborador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
begin
  select * into v_staff from public.staff_members where id = new.staff_id;
  if v_staff.id is null or v_staff.organization_id is distinct from new.organization_id then
    raise exception 'Colaborador de outra empresa.';
  end if;

  if tg_table_name = 'staff_absences' then
    if not private.ausencia_permitida(v_staff.contract, new.kind) then
      raise exception 'Este tipo de ausência não combina com o vínculo do colaborador.';
    end if;
    if new.time_off_id is not null and not exists (
      select 1 from public.time_off t
       where t.id = new.time_off_id and t.organization_id = new.organization_id
    ) then
      raise exception 'Bloqueio de agenda de outra empresa.';
    end if;
  elsif tg_table_name = 'staff_payments' then
    if not private.pagamento_permitido(v_staff.contract, new.kind) then
      raise exception 'Este tipo de pagamento não combina com o vínculo do colaborador.';
    end if;
    if not exists (
      select 1 from public.transactions t
       where t.id = new.transaction_id and t.organization_id = new.organization_id
         and t.kind = 'despesa'
    ) then
      raise exception 'Lançamento de outra empresa.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_conferir_dado_privado
  before insert or update on public.staff_private
  for each row execute function private.conferir_dado_do_colaborador();
create trigger trg_conferir_ausencia
  before insert or update on public.staff_absences
  for each row execute function private.conferir_dado_do_colaborador();
create trigger trg_conferir_pagamento
  before insert or update on public.staff_payments
  for each row execute function private.conferir_dado_do_colaborador();

-- ---------------------------------------------------------------------------
-- Quem vê e quem escreve.
--   dono: tudo (dados pessoais inclusive);
--   contador: lê o cadastro, ausências e pagamentos — precisa para a folha —,
--             mas não lê CPF, Pix nem contato;
--   recepção e profissional: nada. Na agenda, só veem o bloqueio "Ausência".
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['staff_members', 'staff_private', 'staff_absences', 'staff_payments'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['staff_members', 'staff_absences', 'staff_payments'] loop
    execute format($p$create policy "dono e contador leem" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]))$p$, t);
  end loop;
end $$;

create policy "dono cadastra" on public.staff_members
  for insert to authenticated
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));
create policy "dono edita" on public.staff_members
  for update to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));

-- Sem exclusão direta: quem já recebeu algo é anonimizado, não apagado
-- (public.remover_colaborador decide). E só as colunas do combinado são editáveis.
revoke delete on public.staff_members from authenticated, anon;
revoke update on public.staff_members from authenticated, anon;
grant update (professional_id, name, job_title, contract, started_on, ended_on,
              base_pay_cents, commission_bps, per_service_cents)
  on public.staff_members to authenticated;

create policy "só o dono" on public.staff_private
  for all to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));

-- Ausências e pagamentos só nascem pelas funções abaixo, que conferem tudo e
-- gravam a agenda ou o financeiro junto.
revoke insert, update, delete on public.staff_absences from authenticated, anon;
revoke insert, update, delete on public.staff_payments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Categorias de despesa de pessoal
-- ---------------------------------------------------------------------------
create or replace function private.criar_padroes_para(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.accounts (organization_id, name, type) values
    (p_org, 'Caixa', 'caixa'),
    (p_org, 'Conta bancária', 'banco');
  insert into public.categories (organization_id, name, kind, report_group, deductible_hint) values
    (p_org, 'Atendimentos', 'receita', 'operacional', false),
    (p_org, 'Venda de produtos', 'receita', 'operacional', false),
    (p_org, 'Outras receitas', 'receita', 'operacional', false),
    (p_org, 'Aluguel do espaço', 'despesa', 'operacional', true),
    (p_org, 'Energia, água e internet', 'despesa', 'operacional', true),
    (p_org, 'Materiais e insumos', 'despesa', 'operacional', true),
    (p_org, 'Salários e encargos', 'despesa', 'operacional', true),
    (p_org, 'Comissões e repasses a profissionais', 'despesa', 'operacional', false),
    (p_org, 'Conselho de classe e sindicato', 'despesa', 'operacional', true),
    (p_org, 'Cursos, congressos e publicações', 'despesa', 'operacional', true),
    (p_org, 'Marketing', 'despesa', 'operacional', false),
    (p_org, 'Taxas de maquininha e bancárias', 'despesa', 'financeiro', false),
    (p_org, 'Impostos (DAS, ISS, Carnê-Leão)', 'despesa', 'imposto', false),
    (p_org, 'Retirada do dono', 'despesa', 'retirada', false),
    (p_org, 'Outras despesas', 'despesa', 'operacional', false)
  on conflict (organization_id, name, kind) do nothing;
end;
$$;

-- Empresas que já existem ganham a categoria nova (contas não: já têm).
insert into public.categories (organization_id, name, kind, report_group, deductible_hint)
select id, 'Comissões e repasses a profissionais', 'despesa', 'operacional', false
  from public.organizations
on conflict (organization_id, name, kind) do nothing;

/** Garante a categoria de despesa de pessoal (o dono pode ter apagado) e devolve o id. */
create or replace function private.categoria_de_pessoal(p_org uuid, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.categories (organization_id, name, kind, report_group, deductible_hint)
  values (p_org, p_nome, 'despesa', 'operacional', p_nome = 'Salários e encargos')
  on conflict (organization_id, name, kind) do nothing;
  select id into v_id from public.categories
   where organization_id = p_org and kind = 'despesa' and name = p_nome;
  return v_id;
end;
$$;

revoke execute on function private.categoria_de_pessoal(uuid, text) from public;

/** "Juliana Prado Souza" -> "Juliana S." — o contador vê a descrição; CPF nunca. */
create or replace function private.nome_curto(p_nome text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when array_length(partes, 1) > 1
      then partes[1] || ' ' || upper(left(partes[array_length(partes, 1)], 1)) || '.'
    else partes[1]
  end
  from (select regexp_split_to_array(btrim(p_nome), '\s+') as partes) x;
$$;

-- ---------------------------------------------------------------------------
-- Ausências
-- ---------------------------------------------------------------------------
create or replace function public.registrar_ausencia(
  p_staff uuid, p_kind public.staff_absence_kind, p_inicio date, p_fim date
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_tz text;
  v_bloqueio uuid;
  v_id uuid;
begin
  select * into v_staff from public.staff_members where id = p_staff;
  if v_staff.id is null then
    raise exception 'Colaborador não encontrado.';
  end if;
  if not private.has_role(v_staff.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_staff.anonymized_at is not null then
    raise exception 'Este colaborador foi removido.';
  end if;
  if p_kind is null or p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Confira o período: o fim não pode vir antes do início.';
  end if;
  if not private.ausencia_permitida(v_staff.contract, p_kind) then
    raise exception 'Este tipo de ausência não combina com o vínculo do colaborador.';
  end if;

  -- Bloqueia a agenda do dia inicial às 00h até o dia seguinte ao final às 00h,
  -- no fuso da empresa. O motivo é sempre "Ausência": recepção e profissional
  -- leem time_off, e férias ou atestado não são da conta deles.
  if v_staff.professional_id is not null then
    select timezone into v_tz from public.organizations where id = v_staff.organization_id;
    insert into public.time_off (organization_id, professional_id, starts_at, ends_at, reason)
    values (v_staff.organization_id, v_staff.professional_id,
            p_inicio::timestamp at time zone v_tz,
            (p_fim + 1)::timestamp at time zone v_tz,
            'Ausência')
    returning id into v_bloqueio;
  end if;

  insert into public.staff_absences (organization_id, staff_id, kind, starts_on, ends_on, time_off_id)
  values (v_staff.organization_id, v_staff.id, p_kind, p_inicio, p_fim, v_bloqueio)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.registrar_ausencia(uuid, public.staff_absence_kind, date, date) from public, anon;
grant execute on function public.registrar_ausencia(uuid, public.staff_absence_kind, date, date) to authenticated;

create or replace function public.excluir_ausencia(p_absence uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ausencia public.staff_absences;
begin
  select * into v_ausencia from public.staff_absences where id = p_absence;
  if v_ausencia.id is null then
    raise exception 'Ausência não encontrada.';
  end if;
  if not private.has_role(v_ausencia.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  delete from public.staff_absences where id = v_ausencia.id;
  if v_ausencia.time_off_id is not null then
    delete from public.time_off where id = v_ausencia.time_off_id;
  end if;
end;
$$;

revoke execute on function public.excluir_ausencia(uuid) from public, anon;
grant execute on function public.excluir_ausencia(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pagamentos: viram despesa paga no financeiro, numa operação só.
-- O gatilho de mês fechado da transactions continua valendo e desfaz tudo.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pagamento_equipe(
  p_staff uuid,
  p_kind public.staff_payment_kind,
  p_mes date,
  p_valor_cents bigint,
  p_pago_em date,
  p_conta uuid,
  p_forma public.payment_method
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_mes date;
  v_categoria uuid;
  v_rotulo text;
  v_tx uuid;
  v_id uuid;
begin
  select * into v_staff from public.staff_members where id = p_staff;
  if v_staff.id is null then
    raise exception 'Colaborador não encontrado.';
  end if;
  if not private.has_role(v_staff.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_staff.anonymized_at is not null then
    raise exception 'Este colaborador foi removido.';
  end if;
  if p_kind is null or not private.pagamento_permitido(v_staff.contract, p_kind) then
    raise exception 'Este tipo de pagamento não combina com o vínculo do colaborador.';
  end if;
  if p_valor_cents is null or p_valor_cents <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  if p_mes is null then
    raise exception 'Informe o mês de referência.';
  end if;
  if p_pago_em is null then
    raise exception 'Informe a data do pagamento.';
  end if;
  if p_conta is not null and not exists (
    select 1 from public.accounts where id = p_conta and organization_id = v_staff.organization_id
  ) then
    raise exception 'Conta inválida.';
  end if;

  v_mes := date_trunc('month', p_mes::timestamp)::date;
  v_categoria := private.categoria_de_pessoal(
    v_staff.organization_id,
    case when p_kind in ('comissao', 'cota_parte', 'repasse')
      then 'Comissões e repasses a profissionais'
      else 'Salários e encargos'
    end);
  v_rotulo := case p_kind
    when 'salario' then 'Salário'
    when 'comissao' then 'Comissão'
    when 'cota_parte' then 'Cota-parte'
    when 'repasse' then 'Repasse'
    when 'bolsa' then 'Bolsa-auxílio'
    when 'adiantamento' then 'Adiantamento'
    when 'bonus' then 'Bônus'
    when 'beneficio' then 'Benefício'
    when 'encargo' then 'Encargos'
    when 'rescisao' then 'Rescisão'
    else 'Pagamento'
  end;

  insert into public.transactions (
    organization_id, kind, status, description, amount_cents, competence_date, paid_at,
    payment_method, category_id, account_id, created_by
  ) values (
    v_staff.organization_id, 'despesa', 'pago',
    v_rotulo || ' — ' || private.nome_curto(v_staff.name),
    p_valor_cents, v_mes, p_pago_em, p_forma, v_categoria, p_conta, (select auth.uid())
  ) returning id into v_tx;

  insert into public.staff_payments (
    organization_id, staff_id, kind, reference_month, amount_cents, paid_on, transaction_id, created_by
  ) values (
    v_staff.organization_id, v_staff.id, p_kind, v_mes, p_valor_cents, p_pago_em, v_tx, (select auth.uid())
  ) returning id into v_id;

  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
  values (v_staff.organization_id, (select auth.uid()), 'equipe.pagamento_registrado', 'staff_payments', v_id,
          jsonb_build_object('tipo', p_kind, 'valor_cents', p_valor_cents, 'mes', v_mes));
  return v_id;
end;
$$;

revoke execute on function public.registrar_pagamento_equipe(
  uuid, public.staff_payment_kind, date, bigint, date, uuid, public.payment_method) from public, anon;
grant execute on function public.registrar_pagamento_equipe(
  uuid, public.staff_payment_kind, date, bigint, date, uuid, public.payment_method) to authenticated;

create or replace function public.excluir_pagamento_equipe(p_payment uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pagamento public.staff_payments;
begin
  select * into v_pagamento from public.staff_payments where id = p_payment;
  if v_pagamento.id is null then
    raise exception 'Pagamento não encontrado.';
  end if;
  if not private.has_role(v_pagamento.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  -- Apaga o lançamento; a cascata leva o pagamento. Mês fechado barra aqui.
  delete from public.transactions where id = v_pagamento.transaction_id;
end;
$$;

revoke execute on function public.excluir_pagamento_equipe(uuid) from public, anon;
grant execute on function public.excluir_pagamento_equipe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Base da comissão: o que entrou de fato (caixa) pelos atendimentos do
-- profissional no mês. Não é tributo: é a conta comercial combinada.
--
-- Roda com os privilégios do dono da função porque o contador não lê a agenda
-- (appointments) — a checagem de papel é feita aqui dentro.
-- ---------------------------------------------------------------------------
create or replace function public.base_de_comissao(p_staff uuid, p_mes date)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_mes date := date_trunc('month', p_mes::timestamp)::date;
  v_total bigint;
begin
  select * into v_staff from public.staff_members where id = p_staff;
  if v_staff.id is null
     or not private.has_role(v_staff.organization_id, array['dono', 'contador']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_staff.professional_id is null then
    return 0;
  end if;

  select coalesce(sum(t.amount_cents), 0)::bigint into v_total
    from public.transactions t
    join public.appointments a on a.id = t.appointment_id
   where t.organization_id = v_staff.organization_id
     and a.professional_id = v_staff.professional_id
     and t.kind = 'receita'
     and t.status = 'pago'
     and t.paid_at >= v_mes
     and t.paid_at < (v_mes + interval '1 month')::date;
  return v_total;
end;
$$;

revoke execute on function public.base_de_comissao(uuid, date) from public, anon;
grant execute on function public.base_de_comissao(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Remover colaborador: sem pagamento, apaga; com pagamento, anonimiza — os
-- lançamentos ficam pelo prazo que o contador indicar, sem CPF, Pix nem nome.
-- ---------------------------------------------------------------------------
create or replace function public.remover_colaborador(p_staff uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_tz text;
begin
  select * into v_staff from public.staff_members where id = p_staff;
  if v_staff.id is null then
    raise exception 'Colaborador não encontrado.';
  end if;
  if not private.has_role(v_staff.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_staff.anonymized_at is not null then
    return 'anonimizado';
  end if;

  if not exists (select 1 from public.staff_payments where staff_id = v_staff.id) then
    delete from public.time_off
     where id in (select time_off_id from public.staff_absences
                   where staff_id = v_staff.id and time_off_id is not null);
    delete from public.staff_members where id = v_staff.id; -- privados e ausências vão em cascata
    insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
    values (v_staff.organization_id, (select auth.uid()), 'equipe.colaborador_removido',
            'staff_members', v_staff.id, '{}'::jsonb);
    return 'removido';
  end if;

  select timezone into v_tz from public.organizations where id = v_staff.organization_id;
  delete from public.staff_private where staff_id = v_staff.id;
  update public.staff_members set
    name = 'Ex-colaborador',
    job_title = null,
    anonymized_at = now(),
    ended_on = coalesce(ended_on, greatest(started_on, (now() at time zone v_tz)::date))
  where id = v_staff.id;
  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
  values (v_staff.organization_id, (select auth.uid()), 'equipe.colaborador_anonimizado',
          'staff_members', v_staff.id, '{}'::jsonb);
  return 'anonimizado';
end;
$$;

revoke execute on function public.remover_colaborador(uuid) from public, anon;
grant execute on function public.remover_colaborador(uuid) to authenticated;

-- Funções internas: ninguém chama direto pela API (o PostgREST só expõe public),
-- mas também não ficam abertas a qualquer papel.
revoke execute on function private.conferir_colaborador() from public;
revoke execute on function private.conferir_dado_do_colaborador() from public;


-- --------------------------------------------------------------------------
-- 0014_custos_e_ia.sql
-- --------------------------------------------------------------------------

-- Custos operacionais (fixo, variável, fora da operação) e o assistente de IA.
--
-- São dois eixos diferentes do report_group: o report_group define as linhas do
-- resumo do contador; o comportamento do custo diz como ele reage ao volume de
-- atendimentos. Nada aqui mexe no report_group nem nos relatórios do contador.

-- ===========================================================================
-- CUSTOS
-- ===========================================================================
alter table public.categories
  add column cost_behavior text
    check (cost_behavior in ('fixo', 'variavel', 'nao_operacional')),
  add column cost_behavior_source text not null default 'padrao'
    check (cost_behavior_source in ('padrao', 'ia', 'dono'));

/**
 * Comportamento padrão das categorias que o Bossa cria. Receita não é custo;
 * "Retirada do dono" nunca é custo; "Outras despesas" fica para o dono (ou a IA)
 * decidir.
 */
create or replace function private.comportamento_padrao(p_nome text, p_kind public.tx_kind)
returns text
language sql immutable set search_path = ''
as $$
  select case when p_kind = 'receita' then null else
    case p_nome
      when 'Aluguel do espaço' then 'fixo'
      when 'Energia, água e internet' then 'fixo'
      when 'Materiais e insumos' then 'variavel'
      when 'Salários e encargos' then 'fixo'
      when 'Comissões e repasses a profissionais' then 'variavel'
      when 'Conselho de classe e sindicato' then 'fixo'
      when 'Cursos, congressos e publicações' then 'fixo'
      when 'Marketing' then 'fixo'
      when 'Taxas de maquininha e bancárias' then 'variavel'
      when 'Impostos (DAS, ISS, Carnê-Leão)' then 'variavel'
      else null -- Outras despesas, Retirada do dono e as criadas pelo dono
    end
  end;
$$;

update public.categories
   set cost_behavior = private.comportamento_padrao(name, kind)
 where cost_behavior is null and cost_behavior_source = 'padrao';

-- Versão final das categorias padrão, já com o comportamento do custo.
create or replace function private.criar_padroes_para(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.accounts (organization_id, name, type) values
    (p_org, 'Caixa', 'caixa'),
    (p_org, 'Conta bancária', 'banco');
  insert into public.categories
    (organization_id, name, kind, report_group, deductible_hint, cost_behavior)
  select p_org, v.nome, v.tipo, v.grupo, v.dedutivel, private.comportamento_padrao(v.nome, v.tipo)
    from (values
      ('Atendimentos', 'receita'::public.tx_kind, 'operacional', false),
      ('Venda de produtos', 'receita', 'operacional', false),
      ('Outras receitas', 'receita', 'operacional', false),
      ('Aluguel do espaço', 'despesa', 'operacional', true),
      ('Energia, água e internet', 'despesa', 'operacional', true),
      ('Materiais e insumos', 'despesa', 'operacional', true),
      ('Salários e encargos', 'despesa', 'operacional', true),
      ('Comissões e repasses a profissionais', 'despesa', 'operacional', false),
      ('Conselho de classe e sindicato', 'despesa', 'operacional', true),
      ('Cursos, congressos e publicações', 'despesa', 'operacional', true),
      ('Marketing', 'despesa', 'operacional', false),
      ('Taxas de maquininha e bancárias', 'despesa', 'financeiro', false),
      ('Impostos (DAS, ISS, Carnê-Leão)', 'despesa', 'imposto', false),
      ('Retirada do dono', 'despesa', 'retirada', false),
      ('Outras despesas', 'despesa', 'operacional', false)
    ) as v (nome, tipo, grupo, dedutivel)
  on conflict (organization_id, name, kind) do nothing;
end;
$$;

-- A categoria que o pagamento da equipe recria (se o dono apagou) também nasce classificada.
create or replace function private.categoria_de_pessoal(p_org uuid, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.categories
    (organization_id, name, kind, report_group, deductible_hint, cost_behavior)
  values (p_org, p_nome, 'despesa', 'operacional', p_nome = 'Salários e encargos',
          private.comportamento_padrao(p_nome, 'despesa'))
  on conflict (organization_id, name, kind) do nothing;
  select id into v_id from public.categories
   where organization_id = p_org and kind = 'despesa' and name = p_nome;
  return v_id;
end;
$$;

revoke execute on function private.categoria_de_pessoal(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Exceção por lançamento. Fica fora da transactions de propósito: qualquer
-- update num lançamento de mês fechado é barrado, e reclassificar um custo não
-- muda nenhum número do fechamento.
-- ---------------------------------------------------------------------------
create table public.transaction_cost_overrides (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cost_behavior text not null check (cost_behavior in ('fixo', 'variavel', 'nao_operacional')),
  source text not null check (source in ('ia', 'dono')),
  reason text check (reason is null or char_length(reason) <= 200),
  updated_at timestamptz not null default now()
);
create index transaction_cost_overrides_org_idx on public.transaction_cost_overrides (organization_id);

create or replace function private.conferir_excecao_de_custo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.transactions t
      left join public.categories c on c.id = t.category_id
     where t.id = new.transaction_id
       and t.organization_id = new.organization_id
       and t.kind = 'despesa'
       and coalesce(c.report_group, 'operacional') <> 'retirada'
  ) then
    raise exception 'Só despesas da própria empresa (fora a retirada do dono) têm classificação de custo.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_conferir_excecao_de_custo
  before insert or update on public.transaction_cost_overrides
  for each row execute function private.conferir_excecao_de_custo();

revoke execute on function private.conferir_excecao_de_custo() from public;

alter table public.transaction_cost_overrides enable row level security;

create policy "contador lê" on public.transaction_cost_overrides
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));
create policy "dono classifica" on public.transaction_cost_overrides
  for all to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono']::public.member_role[]));

-- ===========================================================================
-- ASSISTENTE DE IA
--
-- Só o dono usa, e cada um vê só as próprias conversas. O conteúdo completo da
-- API (com o raciocínio) fica no servidor: o navegador recebe display_text.
-- ===========================================================================
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_dono_idx on public.ai_conversations (organization_id, user_id, updated_at desc);
create index ai_conversations_updated_idx on public.ai_conversations (updated_at);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,               -- blocos completos da API; nunca vão ao navegador
  display_text text not null default '',
  created_at timestamptz not null default now()
);
create index ai_messages_conversa_idx on public.ai_messages (conversation_id, id);

create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  feature text not null check (feature in ('assistente', 'classificacao')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  web_searches integer not null default 0 check (web_searches >= 0),
  created_at timestamptz not null default now()
);
create index ai_usage_logs_mes_idx on public.ai_usage_logs (organization_id, feature, created_at desc);
create index ai_usage_logs_created_idx on public.ai_usage_logs (created_at);

-- Aceite do aviso de uso da IA (primeiro uso), por pessoa e empresa.
create table public.ai_consents (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- A mensagem é da mesma empresa da conversa, e a conversa "mexe" a cada mensagem
-- (é o updated_at que conta para a retenção).
create or replace function private.conferir_mensagem_de_ia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.ai_conversations set updated_at = now()
   where id = new.conversation_id and organization_id = new.organization_id;
  if not found then
    raise exception 'Conversa de outra empresa.';
  end if;
  return new;
end;
$$;

create trigger trg_conferir_mensagem_de_ia
  before insert on public.ai_messages
  for each row execute function private.conferir_mensagem_de_ia();

revoke execute on function private.conferir_mensagem_de_ia() from public;

do $$
declare t text;
begin
  foreach t in array array['ai_conversations', 'ai_messages', 'ai_usage_logs', 'ai_consents'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "dono vê as próprias conversas" on public.ai_conversations
  for all to authenticated
  using (user_id = (select auth.uid())
         and private.has_role(organization_id, array['dono']::public.member_role[]))
  with check (user_id = (select auth.uid())
              and private.has_role(organization_id, array['dono']::public.member_role[]));

create policy "dono lê as mensagens das próprias conversas" on public.ai_messages
  for select to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[])
         and exists (select 1 from public.ai_conversations c
                      where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy "dono acrescenta mensagens nas próprias conversas" on public.ai_messages
  for insert to authenticated
  with check (private.has_role(organization_id, array['dono']::public.member_role[])
              and exists (select 1 from public.ai_conversations c
                           where c.id = conversation_id and c.user_id = (select auth.uid())));
-- Histórico só por acréscimo: o raciocínio do modelo fica amarrado à conversa.
revoke update, delete on public.ai_messages from authenticated, anon;

create policy "dono lê o uso" on public.ai_usage_logs
  for select to authenticated
  using (private.has_role(organization_id, array['dono']::public.member_role[]));
create policy "dono registra o uso" on public.ai_usage_logs
  for insert to authenticated
  with check (private.has_role(organization_id, array['dono']::public.member_role[])
              and (user_id is null or user_id = (select auth.uid())));
revoke update, delete on public.ai_usage_logs from authenticated, anon;

create policy "dono lê o próprio aceite" on public.ai_consents
  for select to authenticated
  using (user_id = (select auth.uid())
         and private.has_role(organization_id, array['dono']::public.member_role[]));
create policy "dono registra o próprio aceite" on public.ai_consents
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.has_role(organization_id, array['dono']::public.member_role[]));
revoke update, delete on public.ai_consents from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Franquia: quantos usos no mês corrente, no fuso da empresa.
-- ---------------------------------------------------------------------------
create or replace function public.uso_de_ia_no_mes(p_org uuid, p_feature text)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
  v_inicio timestamp;
  v_total integer;
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  select timezone into v_tz from public.organizations where id = p_org;
  v_inicio := date_trunc('month', now() at time zone v_tz);
  select count(*)::integer into v_total
    from public.ai_usage_logs
   where organization_id = p_org
     and feature = p_feature
     and created_at >= (v_inicio at time zone v_tz)
     and created_at < ((v_inicio + interval '1 month') at time zone v_tz);
  return v_total;
end;
$$;

revoke execute on function public.uso_de_ia_no_mes(uuid, text) from public, anon;
grant execute on function public.uso_de_ia_no_mes(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Retenção: conversas paradas há mais de 90 dias [EXEMPLO — o advogado valida]
-- e registros de uso com mais de 12 meses. Função só do servidor, no mesmo
-- molde de limpar_tentativas_antigas / limpar_tentativas_de_conta, chamada pela
-- tarefa diária do Supabase Cron (veja o README).
-- ---------------------------------------------------------------------------
create or replace function private.limpar_dados_de_ia()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_conversas integer;
  v_usos integer;
begin
  delete from public.ai_conversations where updated_at < now() - interval '90 days';
  get diagnostics v_conversas = row_count;
  delete from public.ai_usage_logs where created_at < now() - interval '12 months';
  get diagnostics v_usos = row_count;
  return jsonb_build_object('conversas', v_conversas, 'registros_de_uso', v_usos);
end;
$$;

revoke execute on function private.limpar_dados_de_ia() from public;

create or replace function public.limpar_dados_de_ia()
returns jsonb
language sql security definer set search_path = ''
as $$
  select private.limpar_dados_de_ia();
$$;

revoke execute on function public.limpar_dados_de_ia() from public, anon, authenticated;
grant execute on function public.limpar_dados_de_ia() to service_role;


-- --------------------------------------------------------------------------
-- 0015_correcoes_de_revisao.sql
-- --------------------------------------------------------------------------

-- Correções da revisão dos módulos de equipe, custos e assistente de IA.
--
--   a) franquia de IA reservada antes de chamar a API (pedidos em paralelo não
--      passam do limite) e tokens de escrita de cache no registro de uso;
--   b) histórico do assistente só pelo servidor: gravado por função (com teto de
--      tamanho e controle de concorrência), em json (preserva os bytes enviados
--      à API) e com o conteúdo bruto fora do alcance do navegador;
--   c) conversa: só o título é editável; o prompt de sistema fica congelado;
--   d) anonimizar colaborador apaga de fato o que o identifica;
--   e) trocar o vínculo não trava a agenda nem vira prova de subordinação;
--   f) pagamento da equipe não é editado pelo Financeiro;
--   g) Carnê-Leão não nasce como custo variável;
--   h) exceção de custo com origem 'regra';
--   i) envios de WhatsApp guardados por 12 meses, como a política diz.

-- ===========================================================================
-- a) FRANQUIA DE IA: RESERVA ATÔMICA
-- ===========================================================================
alter table public.ai_usage_logs
  add column cache_creation_tokens integer not null default 0 check (cache_creation_tokens >= 0);

-- Só as funções abaixo gravam o uso. Com insert livre, o navegador apagaria a
-- corrida do servidor (ou inventaria linhas) e a franquia não teria teto.
drop policy "dono registra o uso" on public.ai_usage_logs;
revoke insert, update, delete on public.ai_usage_logs from authenticated, anon;

/**
 * Reserva `p_unidades` usos da franquia ANTES de chamar a API. Pedidos
 * simultâneos da mesma empresa e recurso fazem fila na trava; quem passa do
 * limite recebe erro e nem chega a chamar o modelo.
 *
 * O limite vem do servidor (planos.ts). O dono pode chamar esta função pelo
 * navegador com outro limite, mas isso só gasta a franquia dele: quem chama a
 * API é sempre o servidor, com o limite certo.
 */
create or replace function public.reservar_uso_de_ia(
  p_org uuid, p_feature text, p_unidades integer, p_limite integer
) returns bigint[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_inicio timestamp;
  v_usados integer;
  v_restantes integer;
  v_ids bigint[];
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if p_feature is null or p_feature not in ('assistente', 'classificacao') then
    raise exception 'Recurso de IA desconhecido.';
  end if;
  if p_unidades is null or p_unidades < 1 or p_unidades > 1000 then
    raise exception 'Quantidade de usos de IA inválida.';
  end if;
  if p_limite is null or p_limite < 0 or p_limite > 100000 then
    raise exception 'Limite de IA inválido.';
  end if;

  -- Uma reserva por vez para cada empresa e recurso. A contagem abaixo roda
  -- depois da trava, então enxerga as reservas de quem passou antes.
  perform pg_advisory_xact_lock(
    hashtextextended('bossa.uso_de_ia:' || p_org::text || ':' || p_feature, 0));

  select timezone into v_tz from public.organizations where id = p_org;
  v_inicio := date_trunc('month', now() at time zone v_tz);
  select count(*)::integer into v_usados
    from public.ai_usage_logs
   where organization_id = p_org
     and feature = p_feature
     and created_at >= (v_inicio at time zone v_tz)
     and created_at < ((v_inicio + interval '1 month') at time zone v_tz);

  v_restantes := greatest(p_limite - v_usados, 0);
  if p_unidades > v_restantes then
    if v_restantes = 0 then
      raise exception 'A franquia de IA deste mês acabou.' using detail = '0';
    end if;
    raise exception 'A franquia de IA deste mês não cobre este pedido: restam %.', v_restantes
      using detail = v_restantes::text;
  end if;

  with novas as (
    insert into public.ai_usage_logs (organization_id, user_id, feature)
    select p_org, (select auth.uid()), p_feature from generate_series(1, p_unidades)
    returning id
  )
  select array_agg(id order by id) into v_ids from novas;
  return v_ids;
end;
$$;

revoke execute on function public.reservar_uso_de_ia(uuid, text, integer, integer) from public, anon;
grant execute on function public.reservar_uso_de_ia(uuid, text, integer, integer) to authenticated;

/**
 * Grava os tokens de uma reserva na PRIMEIRA linha dela (a de menor id entre as
 * do próprio usuário). Os valores são os totais acumulados da pergunta ou do
 * lote: pode chamar a cada volta, e nenhum número diminui (o dono não "zera" o
 * próprio registro pelo navegador). Só vale para reservas com menos de 1 dia.
 * Devolve 1 se gravou, 0 se a reserva não existe (ou não é do usuário).
 */
create or replace function public.atualizar_uso_de_ia(
  p_ids bigint[],
  p_input integer,
  p_output integer,
  p_cache_read integer,
  p_cache_creation integer,
  p_web_searches integer
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sem permissão.';
  end if;
  if p_input is null or p_output is null or p_cache_read is null
     or p_cache_creation is null or p_web_searches is null
     or least(p_input, p_output, p_cache_read, p_cache_creation, p_web_searches) < 0 then
    raise exception 'Uso de IA inválido.';
  end if;

  select min(l.id) into v_id
    from public.ai_usage_logs l
   where l.id = any (p_ids)
     and l.user_id = (select auth.uid())
     and l.created_at > now() - interval '1 day'
     and private.has_role(l.organization_id, array['dono']::public.member_role[]);
  if v_id is null then
    return 0;
  end if;

  update public.ai_usage_logs set
    input_tokens = greatest(input_tokens, p_input),
    output_tokens = greatest(output_tokens, p_output),
    cache_read_tokens = greatest(cache_read_tokens, p_cache_read),
    cache_creation_tokens = greatest(cache_creation_tokens, p_cache_creation),
    web_searches = greatest(web_searches, p_web_searches)
  where id = v_id;
  return 1;
end;
$$;

revoke execute on function public.atualizar_uso_de_ia(bigint[], integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.atualizar_uso_de_ia(bigint[], integer, integer, integer, integer, integer)
  to authenticated;

/**
 * Devolve à franquia uma reserva que não chegou a chamar a API (erro antes da
 * primeira chamada, ou lote de classificação que nem saiu). Só apaga linhas da
 * empresa e do usuário informados, criadas há menos de 15 minutos e ainda sem
 * tokens.
 *
 * Só o servidor chama (chave secreta). Se o navegador pudesse cancelar, o dono
 * cancelaria a própria reserva enquanto a resposta ainda está sendo gerada (a
 * linha ainda não tem tokens) e abriria a franquia para a próxima rajada.
 */
create or replace function private.cancelar_uso_de_ia(p_ids bigint[], p_org uuid, p_user uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_total integer;
begin
  delete from public.ai_usage_logs
   where id = any (p_ids)
     and organization_id = p_org
     and user_id = p_user
     and created_at > now() - interval '15 minutes'
     and input_tokens = 0 and output_tokens = 0 and cache_read_tokens = 0
     and cache_creation_tokens = 0 and web_searches = 0;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function private.cancelar_uso_de_ia(bigint[], uuid, uuid) from public;

create or replace function public.cancelar_uso_de_ia(p_ids bigint[], p_org uuid, p_user uuid)
returns integer
language sql security definer set search_path = ''
as $$
  select private.cancelar_uso_de_ia(p_ids, p_org, p_user);
$$;

revoke execute on function public.cancelar_uso_de_ia(bigint[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancelar_uso_de_ia(bigint[], uuid, uuid) to service_role;

-- ===========================================================================
-- b) HISTÓRICO DO ASSISTENTE SÓ PELO SERVIDOR
-- ===========================================================================

-- json, não jsonb: o jsonb reordena as chaves (o input de um tool_use volta
-- com "fim" antes de "inicio"), e o próximo pedido não repete os bytes que
-- foram à API — o cache cai a cada pergunta. O json guarda o texto como veio.
-- (As linhas antigas já estão reordenadas; a conversão só troca o tipo.)
alter table public.ai_messages alter column content type json using content::json;

-- Ninguém escreve direto: só public.acrescentar_mensagens_de_ia, que confere
-- dono, conversa, tamanho e concorrência. E o conteúdo bruto (com o raciocínio
-- do modelo) não é lido pelo navegador: a coluna content fica fora do grant e
-- o servidor lê por public.historico_de_ia.
drop policy "dono acrescenta mensagens nas próprias conversas" on public.ai_messages;
revoke insert, update, delete on public.ai_messages from authenticated, anon;
revoke select on public.ai_messages from authenticated, anon;
grant select (id, conversation_id, organization_id, role, display_text, created_at)
  on public.ai_messages to authenticated;

/**
 * Acrescenta as mensagens de uma pergunta concluída, na ordem, e devolve o id
 * da última.
 *
 * `p_mensagens` é um array json de {role, content, display_text}. `p_apos` é o
 * id da última mensagem que o servidor leu antes de chamar a API (null numa
 * conversa nova): se outra aba gravou depois disso, o histórico intercalado
 * quebraria o raciocínio preservado, então a gravação é recusada.
 */
create or replace function public.acrescentar_mensagens_de_ia(
  p_conversa uuid, p_apos bigint, p_mensagens json
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  -- Uma pergunta pode ter até 8 voltas de 32 mil tokens de saída mais as
  -- buscas na web; 2 MB cobre isso com folga. Por conversa, 8 MB (acima da
  -- janela de contexto do modelo: nada maior que isso seria útil reenviar).
  c_max_por_chamada constant integer := 2 * 1024 * 1024;
  c_max_por_conversa constant bigint := 8 * 1024 * 1024;
  c_max_mensagens constant integer := 40;
  v_conversa public.ai_conversations;
  v_tamanho integer;
  v_total bigint;
  v_item json;
  v_role text;
  v_content json;
  v_id bigint;
begin
  select * into v_conversa from public.ai_conversations where id = p_conversa for update;
  if v_conversa.id is null
     or v_conversa.user_id is distinct from (select auth.uid())
     or not private.has_role(v_conversa.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Conversa não encontrada.';
  end if;

  if p_mensagens is null or json_typeof(p_mensagens) <> 'array' or json_array_length(p_mensagens) = 0 then
    raise exception 'Nenhuma mensagem para gravar.';
  end if;
  if json_array_length(p_mensagens) > c_max_mensagens then
    raise exception 'Mensagens demais numa pergunta só.';
  end if;
  v_tamanho := octet_length(p_mensagens::text);
  if v_tamanho > c_max_por_chamada then
    raise exception 'A resposta ficou grande demais para guardar. Comece uma nova conversa.';
  end if;

  -- Concorrência otimista: a trava acima (for update) enfileira as gravações
  -- da mesma conversa; quem chega depois vê a mensagem da outra aba.
  if exists (
    select 1 from public.ai_messages m
     where m.conversation_id = p_conversa and m.id > coalesce(p_apos, 0)
  ) then
    raise exception 'A conversa foi atualizada em outra aba. Recarregue a página.';
  end if;

  select coalesce(sum(octet_length(m.content::text)), 0) into v_total
    from public.ai_messages m where m.conversation_id = p_conversa;
  if v_total + v_tamanho > c_max_por_conversa then
    raise exception 'Esta conversa ficou longa demais. Comece uma nova conversa.';
  end if;

  for v_item in
    select e.valor from json_array_elements(p_mensagens) with ordinality as e (valor, ordem)
     order by e.ordem
  loop
    if json_typeof(v_item) is distinct from 'object' then
      raise exception 'Mensagem em formato inválido.';
    end if;
    v_role := v_item ->> 'role';
    v_content := v_item -> 'content';
    if v_role is null or v_role not in ('user', 'assistant')
       or v_content is null or json_typeof(v_content) not in ('array', 'string')
       or (json_typeof(v_item -> 'display_text') is not null
           and json_typeof(v_item -> 'display_text') not in ('string', 'null')) then
      raise exception 'Mensagem em formato inválido.';
    end if;
    insert into public.ai_messages (conversation_id, organization_id, role, content, display_text)
    values (p_conversa, v_conversa.organization_id, v_role, v_content,
            coalesce(v_item ->> 'display_text', ''))
    returning id into v_id;
  end loop;

  update public.ai_conversations set updated_at = now() where id = p_conversa;
  return v_id;
end;
$$;

revoke execute on function public.acrescentar_mensagens_de_ia(uuid, bigint, json) from public, anon;
grant execute on function public.acrescentar_mensagens_de_ia(uuid, bigint, json) to authenticated;

/** O histórico completo (com o content da API) de uma conversa do próprio dono, para o servidor. */
create or replace function public.historico_de_ia(p_conversa uuid)
returns table (id bigint, role text, content json, display_text text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_conversations c
     where c.id = p_conversa
       and c.user_id = (select auth.uid())
       and private.has_role(c.organization_id, array['dono']::public.member_role[])
  ) then
    raise exception 'Conversa não encontrada.';
  end if;
  return query
    select m.id, m.role, m.content, m.display_text
      from public.ai_messages m
     where m.conversation_id = p_conversa
     order by m.id;
end;
$$;

revoke execute on function public.historico_de_ia(uuid) from public, anon;
grant execute on function public.historico_de_ia(uuid) to authenticated;

-- ===========================================================================
-- c) CONVERSA: SÓ O TÍTULO É EDITÁVEL; PROMPT DE SISTEMA CONGELADO
-- ===========================================================================

-- O prompt de sistema usado na criação. O raciocínio preservado exige o mesmo
-- system em toda a conversa: se o plano, a cidade ou o segmento mudarem, a
-- conversa antiga continua com o texto de quando começou.
alter table public.ai_conversations
  add column system_snapshot text
    check (system_snapshot is null or char_length(system_snapshot) <= 20000);

-- updated_at decide a retenção de 90 dias: só as funções mexem nele. E a
-- conversa não muda de dono nem de empresa.
revoke insert, update on public.ai_conversations from authenticated, anon;
grant insert (organization_id, user_id, title, system_snapshot) on public.ai_conversations to authenticated;
grant update (title) on public.ai_conversations to authenticated;

-- ===========================================================================
-- d) ANONIMIZAÇÃO COMPLETA DO COLABORADOR
-- ===========================================================================

create or replace function private.rotulo_do_pagamento(p_kind public.staff_payment_kind)
returns text
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'salario' then 'Salário'
    when 'comissao' then 'Comissão'
    when 'cota_parte' then 'Cota-parte'
    when 'repasse' then 'Repasse'
    when 'bolsa' then 'Bolsa-auxílio'
    when 'adiantamento' then 'Adiantamento'
    when 'bonus' then 'Bônus'
    when 'beneficio' then 'Benefício'
    when 'encargo' then 'Encargos'
    when 'rescisao' then 'Rescisão'
    else 'Pagamento'
  end;
$$;

/**
 * Mês fechado continua travado, com duas brechas que não mudam número nenhum:
 * marcar documento emitido (0012) e tirar o nome do colaborador anonimizado da
 * descrição do pagamento dele. A segunda só vale dentro de
 * private.apagar_vestigios_do_colaborador (que liga a marca bossa.anonimizando),
 * só para lançamento de pagamento de colaborador já anonimizado, só quando a
 * descrição vira "<rótulo> — Ex-colaborador" e nenhuma outra coluna muda.
 */
create or replace function private.bloquear_mes_fechado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_meses date[] := '{}';
begin
  if tg_op = 'UPDATE' and tg_table_name = 'transactions' then
    -- Só as marcações de documento mudaram? Então passa: nada do fechamento muda.
    if (new.nota_fiscal_emitida is distinct from old.nota_fiscal_emitida
        or new.receita_saude_emitido is distinct from old.receita_saude_emitido)
       and new.organization_id = old.organization_id
       and new.kind = old.kind
       and new.status = old.status
       and new.amount_cents = old.amount_cents
       and new.competence_date = old.competence_date
       and new.paid_at is not distinct from old.paid_at
       and new.due_date is not distinct from old.due_date
       and new.category_id is not distinct from old.category_id
       and new.account_id is not distinct from old.account_id
       and new.payment_method is not distinct from old.payment_method
       and new.description = old.description
       and new.client_id is not distinct from old.client_id
       and new.payer_type is not distinct from old.payer_type
       and new.revenue_type = old.revenue_type
    then
      return new;
    end if;

    -- Anonimização do colaborador: só a descrição muda, para "<rótulo> — Ex-colaborador".
    if current_setting('bossa.anonimizando', true) = '1'
       and new.description like '% — Ex-colaborador'
       and (to_jsonb(new) - 'description') = (to_jsonb(old) - 'description')
       and exists (
         select 1
           from public.staff_payments sp
           join public.staff_members s on s.id = sp.staff_id
          where sp.transaction_id = new.id and s.anonymized_at is not null
       )
    then
      return new;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_org := new.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(new.paid_at, new.competence_date)::timestamp)::date;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_org := old.organization_id;
    v_meses := v_meses || date_trunc('month', coalesce(old.paid_at, old.competence_date)::timestamp)::date;
  end if;
  if exists (
    select 1 from public.monthly_closings c
    where c.organization_id = v_org and c.reopened_at is null and c.month = any (v_meses)
  ) then
    raise exception 'Mês fechado: reabra o fechamento para alterar este lançamento.';
  end if;
  return coalesce(new, old);
end;
$$;

/**
 * Tira o que ainda identifica um colaborador anonimizado: as ausências (inclusive
 * atestado, que é dado de saúde) com os bloqueios da agenda ligados a elas, e o
 * nome na descrição dos pagamentos, mesmo em mês fechado. Os valores ficam.
 */
create or replace function private.apagar_vestigios_do_colaborador(p_staff uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_bloqueios uuid[];
begin
  select coalesce(array_agg(time_off_id), '{}') into v_bloqueios
    from public.staff_absences where staff_id = p_staff and time_off_id is not null;
  delete from public.staff_absences where staff_id = p_staff;
  delete from public.time_off where id = any (v_bloqueios);

  perform set_config('bossa.anonimizando', '1', true);
  update public.transactions t
     set description = private.rotulo_do_pagamento(sp.kind) || ' — Ex-colaborador'
    from public.staff_payments sp
   where sp.transaction_id = t.id
     and sp.staff_id = p_staff
     and t.description is distinct from private.rotulo_do_pagamento(sp.kind) || ' — Ex-colaborador';
  perform set_config('bossa.anonimizando', '', true);
end;
$$;

revoke execute on function private.apagar_vestigios_do_colaborador(uuid) from public;

-- ---------------------------------------------------------------------------
-- e) Consistência do colaborador.
--   * Anonimizado não muda, exceto perder a ligação com a agenda (apagar o
--     profissional faz isso em cascata, e a anonimização também).
--   * Trocar para um vínculo sem emprego (parceria, MEI, PJ, autônomo) com
--     férias, faltas ou salário já registrados deixaria "PJ com férias" no
--     banco — a prova de subordinação que o vocabulário existe para evitar.
--     Estágio → CLT continua livre (efetivação).
-- ---------------------------------------------------------------------------
create or replace function private.conferir_colaborador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'O colaborador não pode mudar de empresa.';
  end if;
  if tg_op = 'UPDATE' and old.anonymized_at is not null then
    if new.professional_id is null
       and (to_jsonb(new) - 'professional_id') = (to_jsonb(old) - 'professional_id') then
      return new;
    end if;
    raise exception 'Este colaborador foi removido e não pode ser editado.';
  end if;
  if tg_op = 'UPDATE'
     and new.contract is distinct from old.contract
     and new.contract in ('parceria', 'mei', 'pj', 'autonomo')
     and (
       exists (select 1 from public.staff_absences a
                where a.staff_id = new.id and a.kind <> 'indisponivel')
       or exists (select 1 from public.staff_payments p
                   where p.staff_id = new.id and p.kind not in ('cota_parte', 'repasse', 'outro'))
     ) then
    raise exception 'Esta pessoa já tem férias, faltas, salário ou outros registros de emprego. Para o novo vínculo, registre o desligamento deste cadastro e cadastre a pessoa de novo, como outro colaborador.';
  end if;
  if new.professional_id is not null and not exists (
    select 1 from public.professionals p
     where p.id = new.professional_id and p.organization_id = new.organization_id
  ) then
    raise exception 'Profissional de outra empresa.';
  end if;
  return new;
end;
$$;

/**
 * Ausências e pagamentos: vocabulário e empresa só são conferidos quando nascem
 * ou quando tipo, colaborador ou empresa mudam. Apagar o bloqueio da agenda
 * (time_off_id vira null em cascata) não revalida nada: senão, depois de uma
 * troca de vínculo, "Remover bloqueio" e a exclusão do profissional travariam.
 */
create or replace function private.conferir_dado_do_colaborador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_revalidar boolean := true;
  v_conferir_ligacao boolean := true;
begin
  if tg_op = 'UPDATE' and tg_table_name in ('staff_absences', 'staff_payments') then
    if new.staff_id = old.staff_id and new.organization_id = old.organization_id
       and new.kind = old.kind then
      v_revalidar := false;
    end if;
    if tg_table_name = 'staff_absences' then
      v_conferir_ligacao := new.time_off_id is distinct from old.time_off_id;
    else
      v_conferir_ligacao := new.transaction_id is distinct from old.transaction_id;
    end if;
  end if;

  select * into v_staff from public.staff_members where id = new.staff_id;
  if v_staff.id is null or v_staff.organization_id is distinct from new.organization_id then
    raise exception 'Colaborador de outra empresa.';
  end if;

  if tg_table_name = 'staff_absences' then
    if v_revalidar and not private.ausencia_permitida(v_staff.contract, new.kind) then
      raise exception 'Este tipo de ausência não combina com o vínculo do colaborador.';
    end if;
    if v_conferir_ligacao and new.time_off_id is not null and not exists (
      select 1 from public.time_off t
       where t.id = new.time_off_id and t.organization_id = new.organization_id
    ) then
      raise exception 'Bloqueio de agenda de outra empresa.';
    end if;
  elsif tg_table_name = 'staff_payments' then
    if v_revalidar and not private.pagamento_permitido(v_staff.contract, new.kind) then
      raise exception 'Este tipo de pagamento não combina com o vínculo do colaborador.';
    end if;
    if v_conferir_ligacao and not exists (
      select 1 from public.transactions t
       where t.id = new.transaction_id and t.organization_id = new.organization_id
         and t.kind = 'despesa'
    ) then
      raise exception 'Lançamento de outra empresa.';
    end if;
  end if;
  return new;
end;
$$;

-- Remover colaborador: sem pagamento, apaga; com pagamento, anonimiza — os
-- lançamentos ficam pelo prazo que o contador indicar, sem CPF, Pix, nome,
-- ligação com a agenda nem ausências.
create or replace function public.remover_colaborador(p_staff uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_tz text;
begin
  select * into v_staff from public.staff_members where id = p_staff;
  if v_staff.id is null then
    raise exception 'Colaborador não encontrado.';
  end if;
  if not private.has_role(v_staff.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_staff.anonymized_at is not null then
    return 'anonimizado';
  end if;

  if not exists (select 1 from public.staff_payments where staff_id = v_staff.id) then
    delete from public.time_off
     where id in (select time_off_id from public.staff_absences
                   where staff_id = v_staff.id and time_off_id is not null);
    delete from public.staff_members where id = v_staff.id; -- privados e ausências vão em cascata
    insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
    values (v_staff.organization_id, (select auth.uid()), 'equipe.colaborador_removido',
            'staff_members', v_staff.id, '{}'::jsonb);
    return 'removido';
  end if;

  select timezone into v_tz from public.organizations where id = v_staff.organization_id;
  delete from public.staff_private where staff_id = v_staff.id;
  update public.staff_members set
    name = 'Ex-colaborador',
    job_title = null,
    professional_id = null,
    anonymized_at = now(),
    ended_on = coalesce(ended_on, greatest(started_on, (now() at time zone v_tz)::date))
  where id = v_staff.id;
  perform private.apagar_vestigios_do_colaborador(v_staff.id);
  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
  values (v_staff.organization_id, (select auth.uid()), 'equipe.colaborador_anonimizado',
          'staff_members', v_staff.id, '{}'::jsonb);
  return 'anonimizado';
end;
$$;

-- Quem já foi anonimizado antes desta correção.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.staff_members where anonymized_at is not null loop
    perform private.apagar_vestigios_do_colaborador(v_id);
  end loop;
end $$;

update public.staff_members set professional_id = null
 where anonymized_at is not null and professional_id is not null;

-- ===========================================================================
-- f) PAGAMENTO DA EQUIPE NÃO É EDITADO PELO FINANCEIRO
--
-- O staff_payments guarda valor, tipo e data; se o lançamento mudar por fora,
-- Equipe e IA mostram um número e Financeiro/DRE outro. Descrição, categoria,
-- conta e as marcações de documento continuam editáveis; excluir também (a
-- cascata leva o pagamento junto).
-- ===========================================================================
create or replace function private.proteger_pagamento_da_equipe()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_payments sp where sp.transaction_id = old.id) then
    raise exception 'Este lançamento é um pagamento da equipe: altere ou exclua pela tela Equipe.';
  end if;
  return new;
end;
$$;

revoke execute on function private.proteger_pagamento_da_equipe() from public;

create trigger trg_proteger_pagamento_da_equipe
  before update on public.transactions
  for each row
  when (new.amount_cents is distinct from old.amount_cents
        or new.kind is distinct from old.kind
        or new.status is distinct from old.status
        or new.paid_at is distinct from old.paid_at
        or new.competence_date is distinct from old.competence_date
        or new.organization_id is distinct from old.organization_id)
  execute function private.proteger_pagamento_da_equipe();

-- ===========================================================================
-- g) CARNÊ-LEÃO NÃO É CUSTO VARIÁVEL
--
-- A categoria padrão de impostos junta DAS e ISS (variáveis: acompanham o
-- faturamento) com o Carnê-Leão (imposto de renda: fora da operação). Ela nasce
-- sem comportamento, e a regra ou a IA decide lançamento a lançamento.
-- ===========================================================================
create or replace function private.comportamento_padrao(p_nome text, p_kind public.tx_kind)
returns text
language sql immutable set search_path = ''
as $$
  select case when p_kind = 'receita' then null else
    case p_nome
      when 'Aluguel do espaço' then 'fixo'
      when 'Energia, água e internet' then 'fixo'
      when 'Materiais e insumos' then 'variavel'
      when 'Salários e encargos' then 'fixo'
      when 'Comissões e repasses a profissionais' then 'variavel'
      when 'Conselho de classe e sindicato' then 'fixo'
      when 'Cursos, congressos e publicações' then 'fixo'
      when 'Marketing' then 'fixo'
      when 'Taxas de maquininha e bancárias' then 'variavel'
      -- 'Impostos (DAS, ISS, Carnê-Leão)', 'Outras despesas', 'Retirada do
      -- dono' e as criadas pelo dono: decide-se por lançamento.
      else null
    end
  end;
$$;

-- private.criar_padroes_para e private.categoria_de_pessoal (0014) chamam a
-- função acima, então empresas novas já nascem certas. As que existem:
update public.categories
   set cost_behavior = null
 where name = 'Impostos (DAS, ISS, Carnê-Leão)'
   and kind = 'despesa'
   and cost_behavior_source = 'padrao';

-- ===========================================================================
-- h) EXCEÇÃO DE CUSTO GRAVADA PELA REGRA AUTOMÁTICA
-- ===========================================================================
alter table public.transaction_cost_overrides
  drop constraint transaction_cost_overrides_source_check;
alter table public.transaction_cost_overrides
  add constraint transaction_cost_overrides_source_check check (source in ('ia', 'regra', 'dono'));

-- ===========================================================================
-- i) RETENÇÃO DOS ENVIOS DE WHATSAPP: 12 MESES
-- ===========================================================================
create or replace function private.limpar_message_logs()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_total integer;
begin
  delete from public.message_logs where created_at < now() - interval '12 months';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function private.limpar_message_logs() from public;

-- A limpeza diária (README) continua chamando só public.limpar_dados_de_ia.
create or replace function private.limpar_dados_de_ia()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_conversas integer;
  v_usos integer;
begin
  delete from public.ai_conversations where updated_at < now() - interval '90 days';
  get diagnostics v_conversas = row_count;
  delete from public.ai_usage_logs where created_at < now() - interval '12 months';
  get diagnostics v_usos = row_count;
  return jsonb_build_object(
    'conversas', v_conversas,
    'registros_de_uso', v_usos,
    'envios_de_mensagem', private.limpar_message_logs()
  );
end;
$$;

revoke execute on function private.limpar_dados_de_ia() from public;
