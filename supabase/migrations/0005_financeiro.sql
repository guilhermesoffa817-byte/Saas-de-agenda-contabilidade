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
