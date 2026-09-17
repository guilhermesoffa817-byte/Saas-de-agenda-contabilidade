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
