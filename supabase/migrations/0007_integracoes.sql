-- FASE 7 — Integrações: WhatsApp oficial, NFS-e e agenda no celular.

-- ---------------------------------------------------------------------------
-- Registro de tudo que sai pelo WhatsApp. Serve para auditoria, para a franquia
-- do plano e para o cliente provar que o lembrete foi enviado.
-- ---------------------------------------------------------------------------
create table public.message_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  channel text not null default 'whatsapp',
  template text not null,
  provider_message_id text,
  status text not null default 'enviado' check (status in ('enviado', 'entregue', 'lido', 'falhou')),
  error text,
  created_at timestamptz not null default now()
);

create index message_logs_org_mes on public.message_logs (organization_id, created_at desc);
create index message_logs_agendamento on public.message_logs (appointment_id);
-- O webhook da Meta chega com o id da mensagem dela: é por aqui que a gente acha o envio.
create unique index message_logs_provider on public.message_logs (provider_message_id)
  where provider_message_id is not null;

alter table public.message_logs enable row level security;

create policy "dono e recepção leem envios" on public.message_logs
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'recepcao']::public.member_role[]));

-- Quem escreve aqui é o servidor (cron e webhook), com a chave secreta.
revoke insert, update, delete on public.message_logs from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Agenda no celular: cada profissional tem um endereço secreto de assinatura.
-- ---------------------------------------------------------------------------
alter table public.professionals
  add column ical_token text unique default replace(gen_random_uuid()::text, '-', '');

update public.professionals
  set ical_token = replace(gen_random_uuid()::text, '-', '')
  where ical_token is null;

alter table public.professionals alter column ical_token set not null;

-- O token é um segredo: quem tem o endereço lê a agenda. Só o dono troca o seu,
-- e ninguém escolhe o valor — a função sorteia. Revogar coluna a coluna não
-- adianta enquanto existir o update da tabela inteira: tira-se o update e
-- devolve-se só o que a equipe realmente edita.
revoke update on public.professionals from authenticated, anon;
grant update (user_id, name, color, active) on public.professionals to authenticated;

create or replace function public.gerar_token_ical(p_profissional uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_token text;
begin
  select organization_id into v_org from public.professionals where id = p_profissional;
  if v_org is null then
    raise exception 'Profissional não encontrado.';
  end if;
  if not private.has_role(v_org, array['dono']::public.member_role[]) then
    raise exception 'Só o dono troca o link da agenda.';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.professionals set ical_token = v_token where id = p_profissional;
  return v_token;
end;
$$;

revoke execute on function public.gerar_token_ical(uuid) from public, anon;
grant execute on function public.gerar_token_ical(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- NFS-e: o contador configura os códigos por serviço. O Alicerce não calcula
-- imposto nenhum — ele só repassa ao provedor o que foi configurado aqui.
-- ---------------------------------------------------------------------------
create table public.service_tax_codes (
  service_id uuid primary key references public.services(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Código do serviço na lista da LC 116 e o código municipal, quando a prefeitura exige.
  lc116_code text,
  city_service_code text,
  cnae text,
  -- Texto que sai na nota. Quem escreve é quem entende: o contador.
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.service_tax_codes enable row level security;

create policy "equipe do escritório lê os códigos" on public.service_tax_codes
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

create policy "dono e contador configuram os códigos" on public.service_tax_codes
  for all to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]))
  with check (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

-- A nota de cada recebimento. Uma linha por tentativa de emissão.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  provider text not null,
  provider_invoice_id text,
  status text not null default 'processando'
    check (status in ('processando', 'emitida', 'erro', 'cancelada')),
  numero text,
  codigo_verificacao text,
  xml_path text,
  pdf_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_org on public.invoices (organization_id, created_at desc);
create index invoices_lancamento on public.invoices (transaction_id);
create unique index invoices_provider on public.invoices (provider, provider_invoice_id)
  where provider_invoice_id is not null;

alter table public.invoices enable row level security;

create policy "dono e contador leem as notas" on public.invoices
  for select to authenticated
  using (private.has_role(organization_id, array['dono', 'contador']::public.member_role[]));

-- Quem emite é o servidor, falando com o provedor. Ninguém inventa nota pelo cliente.
revoke insert, update, delete on public.invoices from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Porta do servidor para aplicar o resultado que o provedor manda pelo webhook.
-- ---------------------------------------------------------------------------
create or replace function private.aplicar_resultado_da_nota(
  p_provedor text,
  p_id_no_provedor text,
  p_status text,
  p_numero text default null,
  p_codigo text default null,
  p_xml text default null,
  p_pdf text default null,
  p_erro text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nota public.invoices;
begin
  select * into v_nota from public.invoices
    where provider = p_provedor and provider_invoice_id = p_id_no_provedor;

  if v_nota.id is null then
    return null; -- webhook de nota que não é nossa: ignora em silêncio.
  end if;

  update public.invoices set
    status = p_status,
    numero = coalesce(p_numero, numero),
    codigo_verificacao = coalesce(p_codigo, codigo_verificacao),
    xml_path = coalesce(p_xml, xml_path),
    pdf_path = coalesce(p_pdf, pdf_path),
    error = p_erro,
    updated_at = now()
  where id = v_nota.id;

  -- A marca no lançamento é o que o dono vê na tela do financeiro.
  update public.transactions
    set nota_fiscal_emitida = (p_status = 'emitida')
    where id = v_nota.transaction_id;

  return v_nota.id;
end;
$$;

create or replace function public.aplicar_resultado_da_nota(
  p_provedor text,
  p_id_no_provedor text,
  p_status text,
  p_numero text default null,
  p_codigo text default null,
  p_xml text default null,
  p_pdf text default null,
  p_erro text default null
) returns uuid
language sql security definer set search_path = ''
as $$
  select private.aplicar_resultado_da_nota(
    p_provedor, p_id_no_provedor, p_status, p_numero, p_codigo, p_xml, p_pdf, p_erro
  );
$$;

revoke execute on function public.aplicar_resultado_da_nota(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.aplicar_resultado_da_nota(text, text, text, text, text, text, text, text)
  to service_role;

-- Guarda o XML e o PDF da nota. Privado: só o servidor grava, só quem tem
-- link assinado lê.
insert into storage.buckets (id, name, public)
  values ('notas', 'notas', false)
  on conflict (id) do nothing;
