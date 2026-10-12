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
