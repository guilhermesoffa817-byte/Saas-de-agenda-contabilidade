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
