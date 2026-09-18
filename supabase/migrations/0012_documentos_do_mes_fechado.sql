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
