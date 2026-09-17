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
