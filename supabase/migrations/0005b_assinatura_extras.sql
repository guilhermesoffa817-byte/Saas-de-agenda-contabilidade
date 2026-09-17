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
