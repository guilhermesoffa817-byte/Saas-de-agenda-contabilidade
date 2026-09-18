-- ============================================================================
-- ALICERCE — banco de dados completo
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
-- Este arquivo é a junção das 12 migrações do projeto, na ordem certa.
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
-- 0002b_agenda_extras.sql
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
-- 0002c_agendamento_publico.sql
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
-- 0003_financeiro.sql
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
-- 0004_fechamento.sql
-- --------------------------------------------------------------------------

-- supabase/migrations/0004_fechamento.sql
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
-- 0005_assinatura.sql
-- --------------------------------------------------------------------------

-- supabase/migrations/0005_assinatura.sql
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
-- 0005b_assinatura_extras.sql
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
-- 0005c_webhook_cobranca.sql
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
-- 0007_integracoes.sql
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
-- 0008_seguranca.sql
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
-- 0009_documentos_do_mes_fechado.sql
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
