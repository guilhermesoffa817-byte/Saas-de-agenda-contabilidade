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
