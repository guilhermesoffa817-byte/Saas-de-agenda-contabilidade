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
