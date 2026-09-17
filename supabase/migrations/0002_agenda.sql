create type public.appointment_status as enum ('agendado', 'confirmado', 'concluido', 'faltou', 'cancelado');

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  color text not null default '#0F3D2E',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  duration_min int not null check (duration_min between 5 and 600),
  buffer_min int not null default 0 check (buffer_min between 0 and 120), -- preparo/limpeza após o atendimento
  price_cents bigint not null check (price_cents >= 0),
  bookable_online boolean not null default true,
  active boolean not null default true
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone_e164 text,                    -- +5566999999999
  email text,
  document text,                      -- CPF opcional (necessário para recibos e notas)
  payer_type text not null default 'pf' check (payer_type in ('pf', 'pj')),
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  notes text,                         -- anotações administrativas. NÃO é prontuário.
  no_show_count int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, phone_e164)
);

create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id),
  client_id uuid not null references public.clients(id),
  service_id uuid not null references public.services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,       -- já inclui o buffer do serviço
  status public.appointment_status not null default 'agendado',
  price_cents bigint not null check (price_cents >= 0),
  source text not null default 'interno' check (source in ('interno', 'link_publico')),
  confirmed_at timestamptz,
  reminder_sent_at timestamptz,
  cancel_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- O banco impede dois atendimentos ativos no mesmo horário do mesmo profissional
  constraint sem_conflito_de_horario exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('agendado', 'confirmado'))
);
create index on public.appointments (organization_id, starts_at);

do $$
declare t text;
begin
  foreach t in array array['professionals', 'services', 'clients', 'working_hours', 'time_off', 'appointments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "equipe lê" on public.%I for select to authenticated
      using (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['clients', 'appointments', 'time_off'] loop
    execute format($p$create policy "equipe escreve" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono', 'recepcao', 'profissional']::public.member_role[]))$p$, t);
  end loop;
  foreach t in array array['professionals', 'services', 'working_hours'] loop
    execute format($p$create policy "dono configura" on public.%I for all to authenticated
      using (private.has_role(organization_id, array['dono']::public.member_role[]))
      with check (private.has_role(organization_id, array['dono']::public.member_role[]))$p$, t);
  end loop;
end $$;
