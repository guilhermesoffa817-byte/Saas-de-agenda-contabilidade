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
