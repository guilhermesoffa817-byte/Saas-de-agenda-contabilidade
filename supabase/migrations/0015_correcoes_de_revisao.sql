-- Correções da revisão dos módulos de equipe, custos e assistente de IA.
--
--   a) franquia de IA reservada antes de chamar a API (pedidos em paralelo não
--      passam do limite) e tokens de escrita de cache no registro de uso;
--   b) histórico do assistente só pelo servidor: gravado por função (com teto de
--      tamanho e controle de concorrência), em json (preserva os bytes enviados
--      à API) e com o conteúdo bruto fora do alcance do navegador;
--   c) conversa: só o título é editável; o prompt de sistema fica congelado;
--   d) anonimizar colaborador apaga de fato o que o identifica;
--   e) trocar o vínculo não trava a agenda nem vira prova de subordinação;
--   f) pagamento da equipe não é editado pelo Financeiro;
--   g) Carnê-Leão não nasce como custo variável;
--   h) exceção de custo com origem 'regra';
--   i) envios de WhatsApp guardados por 12 meses, como a política diz.

-- ===========================================================================
-- a) FRANQUIA DE IA: RESERVA ATÔMICA
-- ===========================================================================
alter table public.ai_usage_logs
  add column cache_creation_tokens integer not null default 0 check (cache_creation_tokens >= 0);

-- Só as funções abaixo gravam o uso. Com insert livre, o navegador apagaria a
-- corrida do servidor (ou inventaria linhas) e a franquia não teria teto.
drop policy "dono registra o uso" on public.ai_usage_logs;
revoke insert, update, delete on public.ai_usage_logs from authenticated, anon;

/**
 * Reserva `p_unidades` usos da franquia ANTES de chamar a API. Pedidos
 * simultâneos da mesma empresa e recurso fazem fila na trava; quem passa do
 * limite recebe erro e nem chega a chamar o modelo.
 *
 * O limite vem do servidor (planos.ts). O dono pode chamar esta função pelo
 * navegador com outro limite, mas isso só gasta a franquia dele: quem chama a
 * API é sempre o servidor, com o limite certo.
 */
create or replace function public.reservar_uso_de_ia(
  p_org uuid, p_feature text, p_unidades integer, p_limite integer
) returns bigint[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_inicio timestamp;
  v_usados integer;
  v_restantes integer;
  v_ids bigint[];
begin
  if not private.has_role(p_org, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if p_feature is null or p_feature not in ('assistente', 'classificacao') then
    raise exception 'Recurso de IA desconhecido.';
  end if;
  if p_unidades is null or p_unidades < 1 or p_unidades > 1000 then
    raise exception 'Quantidade de usos de IA inválida.';
  end if;
  if p_limite is null or p_limite < 0 or p_limite > 100000 then
    raise exception 'Limite de IA inválido.';
  end if;

  -- Uma reserva por vez para cada empresa e recurso. A contagem abaixo roda
  -- depois da trava, então enxerga as reservas de quem passou antes.
  perform pg_advisory_xact_lock(
    hashtextextended('bossa.uso_de_ia:' || p_org::text || ':' || p_feature, 0));

  select timezone into v_tz from public.organizations where id = p_org;
  v_inicio := date_trunc('month', now() at time zone v_tz);
  select count(*)::integer into v_usados
    from public.ai_usage_logs
   where organization_id = p_org
     and feature = p_feature
     and created_at >= (v_inicio at time zone v_tz)
     and created_at < ((v_inicio + interval '1 month') at time zone v_tz);

  v_restantes := greatest(p_limite - v_usados, 0);
  if p_unidades > v_restantes then
    if v_restantes = 0 then
      raise exception 'A franquia de IA deste mês acabou.' using detail = '0';
    end if;
    raise exception 'A franquia de IA deste mês não cobre este pedido: restam %.', v_restantes
      using detail = v_restantes::text;
  end if;

  with novas as (
    insert into public.ai_usage_logs (organization_id, user_id, feature)
    select p_org, (select auth.uid()), p_feature from generate_series(1, p_unidades)
    returning id
  )
  select array_agg(id order by id) into v_ids from novas;
  return v_ids;
end;
$$;

revoke execute on function public.reservar_uso_de_ia(uuid, text, integer, integer) from public, anon;
grant execute on function public.reservar_uso_de_ia(uuid, text, integer, integer) to authenticated;

/**
 * Grava os tokens de uma reserva na PRIMEIRA linha dela (a de menor id entre as
 * do próprio usuário). Os valores são os totais acumulados da pergunta ou do
 * lote: pode chamar a cada volta, e nenhum número diminui (o dono não "zera" o
 * próprio registro pelo navegador). Só vale para reservas com menos de 1 dia.
 * Devolve 1 se gravou, 0 se a reserva não existe (ou não é do usuário).
 */
create or replace function public.atualizar_uso_de_ia(
  p_ids bigint[],
  p_input integer,
  p_output integer,
  p_cache_read integer,
  p_cache_creation integer,
  p_web_searches integer
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sem permissão.';
  end if;
  if p_input is null or p_output is null or p_cache_read is null
     or p_cache_creation is null or p_web_searches is null
     or least(p_input, p_output, p_cache_read, p_cache_creation, p_web_searches) < 0 then
    raise exception 'Uso de IA inválido.';
  end if;

  select min(l.id) into v_id
    from public.ai_usage_logs l
   where l.id = any (p_ids)
     and l.user_id = (select auth.uid())
     and l.created_at > now() - interval '1 day'
     and private.has_role(l.organization_id, array['dono']::public.member_role[]);
  if v_id is null then
    return 0;
  end if;

  update public.ai_usage_logs set
    input_tokens = greatest(input_tokens, p_input),
    output_tokens = greatest(output_tokens, p_output),
    cache_read_tokens = greatest(cache_read_tokens, p_cache_read),
    cache_creation_tokens = greatest(cache_creation_tokens, p_cache_creation),
    web_searches = greatest(web_searches, p_web_searches)
  where id = v_id;
  return 1;
end;
$$;

revoke execute on function public.atualizar_uso_de_ia(bigint[], integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.atualizar_uso_de_ia(bigint[], integer, integer, integer, integer, integer)
  to authenticated;

/**
 * Devolve à franquia uma reserva que não chegou a chamar a API (erro antes da
 * primeira chamada, ou lote de classificação que nem saiu). Só apaga linhas da
 * empresa e do usuário informados, criadas há menos de 15 minutos e ainda sem
 * tokens.
 *
 * Só o servidor chama (chave secreta). Se o navegador pudesse cancelar, o dono
 * cancelaria a própria reserva enquanto a resposta ainda está sendo gerada (a
 * linha ainda não tem tokens) e abriria a franquia para a próxima rajada.
 */
create or replace function private.cancelar_uso_de_ia(p_ids bigint[], p_org uuid, p_user uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_total integer;
begin
  delete from public.ai_usage_logs
   where id = any (p_ids)
     and organization_id = p_org
     and user_id = p_user
     and created_at > now() - interval '15 minutes'
     and input_tokens = 0 and output_tokens = 0 and cache_read_tokens = 0
     and cache_creation_tokens = 0 and web_searches = 0;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function private.cancelar_uso_de_ia(bigint[], uuid, uuid) from public;

create or replace function public.cancelar_uso_de_ia(p_ids bigint[], p_org uuid, p_user uuid)
returns integer
language sql security definer set search_path = ''
as $$
  select private.cancelar_uso_de_ia(p_ids, p_org, p_user);
$$;

revoke execute on function public.cancelar_uso_de_ia(bigint[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancelar_uso_de_ia(bigint[], uuid, uuid) to service_role;

-- ===========================================================================
-- b) HISTÓRICO DO ASSISTENTE SÓ PELO SERVIDOR
-- ===========================================================================

-- json, não jsonb: o jsonb reordena as chaves (o input de um tool_use volta
-- com "fim" antes de "inicio"), e o próximo pedido não repete os bytes que
-- foram à API — o cache cai a cada pergunta. O json guarda o texto como veio.
-- (As linhas antigas já estão reordenadas; a conversão só troca o tipo.)
alter table public.ai_messages alter column content type json using content::json;

-- Ninguém escreve direto: só public.acrescentar_mensagens_de_ia, que confere
-- dono, conversa, tamanho e concorrência. E o conteúdo bruto (com o raciocínio
-- do modelo) não é lido pelo navegador: a coluna content fica fora do grant e
-- o servidor lê por public.historico_de_ia.
drop policy "dono acrescenta mensagens nas próprias conversas" on public.ai_messages;
revoke insert, update, delete on public.ai_messages from authenticated, anon;
revoke select on public.ai_messages from authenticated, anon;
grant select (id, conversation_id, organization_id, role, display_text, created_at)
  on public.ai_messages to authenticated;

/**
 * Acrescenta as mensagens de uma pergunta concluída, na ordem, e devolve o id
 * da última.
 *
 * `p_mensagens` é um array json de {role, content, display_text}. `p_apos` é o
 * id da última mensagem que o servidor leu antes de chamar a API (null numa
 * conversa nova): se outra aba gravou depois disso, o histórico intercalado
 * quebraria o raciocínio preservado, então a gravação é recusada.
 */
create or replace function public.acrescentar_mensagens_de_ia(
  p_conversa uuid, p_apos bigint, p_mensagens json
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  -- Uma pergunta pode ter até 8 voltas de 32 mil tokens de saída mais as
  -- buscas na web; 2 MB cobre isso com folga. Por conversa, 8 MB (acima da
  -- janela de contexto do modelo: nada maior que isso seria útil reenviar).
  c_max_por_chamada constant integer := 2 * 1024 * 1024;
  c_max_por_conversa constant bigint := 8 * 1024 * 1024;
  c_max_mensagens constant integer := 40;
  v_conversa public.ai_conversations;
  v_tamanho integer;
  v_total bigint;
  v_item json;
  v_role text;
  v_content json;
  v_id bigint;
begin
  select * into v_conversa from public.ai_conversations where id = p_conversa for update;
  if v_conversa.id is null
     or v_conversa.user_id is distinct from (select auth.uid())
     or not private.has_role(v_conversa.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Conversa não encontrada.';
  end if;

  if p_mensagens is null or json_typeof(p_mensagens) <> 'array' or json_array_length(p_mensagens) = 0 then
    raise exception 'Nenhuma mensagem para gravar.';
  end if;
  if json_array_length(p_mensagens) > c_max_mensagens then
    raise exception 'Mensagens demais numa pergunta só.';
  end if;
  v_tamanho := octet_length(p_mensagens::text);
  if v_tamanho > c_max_por_chamada then
    raise exception 'A resposta ficou grande demais para guardar. Comece uma nova conversa.';
  end if;

  -- Concorrência otimista: a trava acima (for update) enfileira as gravações
  -- da mesma conversa; quem chega depois vê a mensagem da outra aba.
  if exists (
    select 1 from public.ai_messages m
     where m.conversation_id = p_conversa and m.id > coalesce(p_apos, 0)
  ) then
    raise exception 'A conversa foi atualizada em outra aba. Recarregue a página.';
  end if;

  select coalesce(sum(octet_length(m.content::text)), 0) into v_total
    from public.ai_messages m where m.conversation_id = p_conversa;
  if v_total + v_tamanho > c_max_por_conversa then
    raise exception 'Esta conversa ficou longa demais. Comece uma nova conversa.';
  end if;

  for v_item in
    select e.valor from json_array_elements(p_mensagens) with ordinality as e (valor, ordem)
     order by e.ordem
  loop
    if json_typeof(v_item) is distinct from 'object' then
      raise exception 'Mensagem em formato inválido.';
    end if;
    v_role := v_item ->> 'role';
    v_content := v_item -> 'content';
    if v_role is null or v_role not in ('user', 'assistant')
       or v_content is null or json_typeof(v_content) not in ('array', 'string')
       or (json_typeof(v_item -> 'display_text') is not null
           and json_typeof(v_item -> 'display_text') not in ('string', 'null')) then
      raise exception 'Mensagem em formato inválido.';
    end if;
    insert into public.ai_messages (conversation_id, organization_id, role, content, display_text)
    values (p_conversa, v_conversa.organization_id, v_role, v_content,
            coalesce(v_item ->> 'display_text', ''))
    returning id into v_id;
  end loop;

  update public.ai_conversations set updated_at = now() where id = p_conversa;
  return v_id;
end;
$$;

revoke execute on function public.acrescentar_mensagens_de_ia(uuid, bigint, json) from public, anon;
grant execute on function public.acrescentar_mensagens_de_ia(uuid, bigint, json) to authenticated;

/** O histórico completo (com o content da API) de uma conversa do próprio dono, para o servidor. */
create or replace function public.historico_de_ia(p_conversa uuid)
returns table (id bigint, role text, content json, display_text text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_conversations c
     where c.id = p_conversa
       and c.user_id = (select auth.uid())
       and private.has_role(c.organization_id, array['dono']::public.member_role[])
  ) then
    raise exception 'Conversa não encontrada.';
  end if;
  return query
    select m.id, m.role, m.content, m.display_text
      from public.ai_messages m
     where m.conversation_id = p_conversa
     order by m.id;
end;
$$;

revoke execute on function public.historico_de_ia(uuid) from public, anon;
grant execute on function public.historico_de_ia(uuid) to authenticated;

-- ===========================================================================
-- c) CONVERSA: SÓ O TÍTULO É EDITÁVEL; PROMPT DE SISTEMA CONGELADO
-- ===========================================================================

-- O prompt de sistema usado na criação. O raciocínio preservado exige o mesmo
-- system em toda a conversa: se o plano, a cidade ou o segmento mudarem, a
-- conversa antiga continua com o texto de quando começou.
alter table public.ai_conversations
  add column system_snapshot text
    check (system_snapshot is null or char_length(system_snapshot) <= 20000);

-- updated_at decide a retenção de 90 dias: só as funções mexem nele. E a
-- conversa não muda de dono nem de empresa.
revoke insert, update on public.ai_conversations from authenticated, anon;
grant insert (organization_id, user_id, title, system_snapshot) on public.ai_conversations to authenticated;
grant update (title) on public.ai_conversations to authenticated;

-- ===========================================================================
-- d) ANONIMIZAÇÃO COMPLETA DO COLABORADOR
-- ===========================================================================

create or replace function private.rotulo_do_pagamento(p_kind public.staff_payment_kind)
returns text
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'salario' then 'Salário'
    when 'comissao' then 'Comissão'
    when 'cota_parte' then 'Cota-parte'
    when 'repasse' then 'Repasse'
    when 'bolsa' then 'Bolsa-auxílio'
    when 'adiantamento' then 'Adiantamento'
    when 'bonus' then 'Bônus'
    when 'beneficio' then 'Benefício'
    when 'encargo' then 'Encargos'
    when 'rescisao' then 'Rescisão'
    else 'Pagamento'
  end;
$$;

/**
 * Mês fechado continua travado, com duas brechas que não mudam número nenhum:
 * marcar documento emitido (0012) e tirar o nome do colaborador anonimizado da
 * descrição do pagamento dele. A segunda só vale dentro de
 * private.apagar_vestigios_do_colaborador (que liga a marca bossa.anonimizando),
 * só para lançamento de pagamento de colaborador já anonimizado, só quando a
 * descrição vira "<rótulo> — Ex-colaborador" e nenhuma outra coluna muda.
 */
create or replace function private.bloquear_mes_fechado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_meses date[] := '{}';
begin
  if tg_op = 'UPDATE' and tg_table_name = 'transactions' then
    -- Só as marcações de documento mudaram? Então passa: nada do fechamento muda.
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

    -- Anonimização do colaborador: só a descrição muda, para "<rótulo> — Ex-colaborador".
    if current_setting('bossa.anonimizando', true) = '1'
       and new.description like '% — Ex-colaborador'
       and (to_jsonb(new) - 'description') = (to_jsonb(old) - 'description')
       and exists (
         select 1
           from public.staff_payments sp
           join public.staff_members s on s.id = sp.staff_id
          where sp.transaction_id = new.id and s.anonymized_at is not null
       )
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

/**
 * Tira o que ainda identifica um colaborador anonimizado: as ausências (inclusive
 * atestado, que é dado de saúde) com os bloqueios da agenda ligados a elas, e o
 * nome na descrição dos pagamentos, mesmo em mês fechado. Os valores ficam.
 */
create or replace function private.apagar_vestigios_do_colaborador(p_staff uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_bloqueios uuid[];
begin
  select coalesce(array_agg(time_off_id), '{}') into v_bloqueios
    from public.staff_absences where staff_id = p_staff and time_off_id is not null;
  delete from public.staff_absences where staff_id = p_staff;
  delete from public.time_off where id = any (v_bloqueios);

  perform set_config('bossa.anonimizando', '1', true);
  update public.transactions t
     set description = private.rotulo_do_pagamento(sp.kind) || ' — Ex-colaborador'
    from public.staff_payments sp
   where sp.transaction_id = t.id
     and sp.staff_id = p_staff
     and t.description is distinct from private.rotulo_do_pagamento(sp.kind) || ' — Ex-colaborador';
  perform set_config('bossa.anonimizando', '', true);
end;
$$;

revoke execute on function private.apagar_vestigios_do_colaborador(uuid) from public;

-- ---------------------------------------------------------------------------
-- e) Consistência do colaborador.
--   * Anonimizado não muda, exceto perder a ligação com a agenda (apagar o
--     profissional faz isso em cascata, e a anonimização também).
--   * Trocar para um vínculo sem emprego (parceria, MEI, PJ, autônomo) com
--     férias, faltas ou salário já registrados deixaria "PJ com férias" no
--     banco — a prova de subordinação que o vocabulário existe para evitar.
--     Estágio → CLT continua livre (efetivação).
-- ---------------------------------------------------------------------------
create or replace function private.conferir_colaborador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'O colaborador não pode mudar de empresa.';
  end if;
  if tg_op = 'UPDATE' and old.anonymized_at is not null then
    if new.professional_id is null
       and (to_jsonb(new) - 'professional_id') = (to_jsonb(old) - 'professional_id') then
      return new;
    end if;
    raise exception 'Este colaborador foi removido e não pode ser editado.';
  end if;
  if tg_op = 'UPDATE'
     and new.contract is distinct from old.contract
     and new.contract in ('parceria', 'mei', 'pj', 'autonomo')
     and (
       exists (select 1 from public.staff_absences a
                where a.staff_id = new.id and a.kind <> 'indisponivel')
       or exists (select 1 from public.staff_payments p
                   where p.staff_id = new.id and p.kind not in ('cota_parte', 'repasse', 'outro'))
     ) then
    raise exception 'Esta pessoa já tem férias, faltas, salário ou outros registros de emprego. Para o novo vínculo, registre o desligamento deste cadastro e cadastre a pessoa de novo, como outro colaborador.';
  end if;
  if new.professional_id is not null and not exists (
    select 1 from public.professionals p
     where p.id = new.professional_id and p.organization_id = new.organization_id
  ) then
    raise exception 'Profissional de outra empresa.';
  end if;
  return new;
end;
$$;

/**
 * Ausências e pagamentos: vocabulário e empresa só são conferidos quando nascem
 * ou quando tipo, colaborador ou empresa mudam. Apagar o bloqueio da agenda
 * (time_off_id vira null em cascata) não revalida nada: senão, depois de uma
 * troca de vínculo, "Remover bloqueio" e a exclusão do profissional travariam.
 */
create or replace function private.conferir_dado_do_colaborador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_revalidar boolean := true;
  v_conferir_ligacao boolean := true;
begin
  if tg_op = 'UPDATE' and tg_table_name in ('staff_absences', 'staff_payments') then
    if new.staff_id = old.staff_id and new.organization_id = old.organization_id
       and new.kind = old.kind then
      v_revalidar := false;
    end if;
    if tg_table_name = 'staff_absences' then
      v_conferir_ligacao := new.time_off_id is distinct from old.time_off_id;
    else
      v_conferir_ligacao := new.transaction_id is distinct from old.transaction_id;
    end if;
  end if;

  select * into v_staff from public.staff_members where id = new.staff_id;
  if v_staff.id is null or v_staff.organization_id is distinct from new.organization_id then
    raise exception 'Colaborador de outra empresa.';
  end if;

  if tg_table_name = 'staff_absences' then
    if v_revalidar and not private.ausencia_permitida(v_staff.contract, new.kind) then
      raise exception 'Este tipo de ausência não combina com o vínculo do colaborador.';
    end if;
    if v_conferir_ligacao and new.time_off_id is not null and not exists (
      select 1 from public.time_off t
       where t.id = new.time_off_id and t.organization_id = new.organization_id
    ) then
      raise exception 'Bloqueio de agenda de outra empresa.';
    end if;
  elsif tg_table_name = 'staff_payments' then
    if v_revalidar and not private.pagamento_permitido(v_staff.contract, new.kind) then
      raise exception 'Este tipo de pagamento não combina com o vínculo do colaborador.';
    end if;
    if v_conferir_ligacao and not exists (
      select 1 from public.transactions t
       where t.id = new.transaction_id and t.organization_id = new.organization_id
         and t.kind = 'despesa'
    ) then
      raise exception 'Lançamento de outra empresa.';
    end if;
  end if;
  return new;
end;
$$;

-- Remover colaborador: sem pagamento, apaga; com pagamento, anonimiza — os
-- lançamentos ficam pelo prazo que o contador indicar, sem CPF, Pix, nome,
-- ligação com a agenda nem ausências.
create or replace function public.remover_colaborador(p_staff uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff_members;
  v_tz text;
begin
  select * into v_staff from public.staff_members where id = p_staff;
  if v_staff.id is null then
    raise exception 'Colaborador não encontrado.';
  end if;
  if not private.has_role(v_staff.organization_id, array['dono']::public.member_role[]) then
    raise exception 'Sem permissão.';
  end if;
  if v_staff.anonymized_at is not null then
    return 'anonimizado';
  end if;

  if not exists (select 1 from public.staff_payments where staff_id = v_staff.id) then
    delete from public.time_off
     where id in (select time_off_id from public.staff_absences
                   where staff_id = v_staff.id and time_off_id is not null);
    delete from public.staff_members where id = v_staff.id; -- privados e ausências vão em cascata
    insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
    values (v_staff.organization_id, (select auth.uid()), 'equipe.colaborador_removido',
            'staff_members', v_staff.id, '{}'::jsonb);
    return 'removido';
  end if;

  select timezone into v_tz from public.organizations where id = v_staff.organization_id;
  delete from public.staff_private where staff_id = v_staff.id;
  update public.staff_members set
    name = 'Ex-colaborador',
    job_title = null,
    professional_id = null,
    anonymized_at = now(),
    ended_on = coalesce(ended_on, greatest(started_on, (now() at time zone v_tz)::date))
  where id = v_staff.id;
  perform private.apagar_vestigios_do_colaborador(v_staff.id);
  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, metadata)
  values (v_staff.organization_id, (select auth.uid()), 'equipe.colaborador_anonimizado',
          'staff_members', v_staff.id, '{}'::jsonb);
  return 'anonimizado';
end;
$$;

-- Quem já foi anonimizado antes desta correção.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.staff_members where anonymized_at is not null loop
    perform private.apagar_vestigios_do_colaborador(v_id);
  end loop;
end $$;

update public.staff_members set professional_id = null
 where anonymized_at is not null and professional_id is not null;

-- ===========================================================================
-- f) PAGAMENTO DA EQUIPE NÃO É EDITADO PELO FINANCEIRO
--
-- O staff_payments guarda valor, tipo e data; se o lançamento mudar por fora,
-- Equipe e IA mostram um número e Financeiro/DRE outro. Descrição, categoria,
-- conta e as marcações de documento continuam editáveis; excluir também (a
-- cascata leva o pagamento junto).
-- ===========================================================================
create or replace function private.proteger_pagamento_da_equipe()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_payments sp where sp.transaction_id = old.id) then
    raise exception 'Este lançamento é um pagamento da equipe: altere ou exclua pela tela Equipe.';
  end if;
  return new;
end;
$$;

revoke execute on function private.proteger_pagamento_da_equipe() from public;

create trigger trg_proteger_pagamento_da_equipe
  before update on public.transactions
  for each row
  when (new.amount_cents is distinct from old.amount_cents
        or new.kind is distinct from old.kind
        or new.status is distinct from old.status
        or new.paid_at is distinct from old.paid_at
        or new.competence_date is distinct from old.competence_date
        or new.organization_id is distinct from old.organization_id)
  execute function private.proteger_pagamento_da_equipe();

-- ===========================================================================
-- g) CARNÊ-LEÃO NÃO É CUSTO VARIÁVEL
--
-- A categoria padrão de impostos junta DAS e ISS (variáveis: acompanham o
-- faturamento) com o Carnê-Leão (imposto de renda: fora da operação). Ela nasce
-- sem comportamento, e a regra ou a IA decide lançamento a lançamento.
-- ===========================================================================
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
      -- 'Impostos (DAS, ISS, Carnê-Leão)', 'Outras despesas', 'Retirada do
      -- dono' e as criadas pelo dono: decide-se por lançamento.
      else null
    end
  end;
$$;

-- private.criar_padroes_para e private.categoria_de_pessoal (0014) chamam a
-- função acima, então empresas novas já nascem certas. As que existem:
update public.categories
   set cost_behavior = null
 where name = 'Impostos (DAS, ISS, Carnê-Leão)'
   and kind = 'despesa'
   and cost_behavior_source = 'padrao';

-- ===========================================================================
-- h) EXCEÇÃO DE CUSTO GRAVADA PELA REGRA AUTOMÁTICA
-- ===========================================================================
alter table public.transaction_cost_overrides
  drop constraint transaction_cost_overrides_source_check;
alter table public.transaction_cost_overrides
  add constraint transaction_cost_overrides_source_check check (source in ('ia', 'regra', 'dono'));

-- ===========================================================================
-- i) RETENÇÃO DOS ENVIOS DE WHATSAPP: 12 MESES
-- ===========================================================================
create or replace function private.limpar_message_logs()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_total integer;
begin
  delete from public.message_logs where created_at < now() - interval '12 months';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function private.limpar_message_logs() from public;

-- A limpeza diária (README) continua chamando só public.limpar_dados_de_ia.
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
  return jsonb_build_object(
    'conversas', v_conversas,
    'registros_de_uso', v_usos,
    'envios_de_mensagem', private.limpar_message_logs()
  );
end;
$$;

revoke execute on function private.limpar_dados_de_ia() from public;
