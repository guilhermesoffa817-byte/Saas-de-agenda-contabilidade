import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { limiteDeIa, type RecursoDeIa } from "@/lib/planos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/lib/supabase/database.types";

type Cliente = SupabaseClient<Database>;

export type CotaDeIa = { limite: number; usados: number; restantes: number };

/**
 * Quanto da franquia mensal de IA a empresa já usou, no fuso dela. A conta é
 * feita no banco (public.uso_de_ia_no_mes), que exige o papel de dono.
 * Serve para MOSTRAR o saldo; para liberar a IA, use reservarUsoDeIa (esta
 * leitura não segura nada contra pedidos em paralelo).
 * Lança erro se não conseguir conferir.
 */
export async function cotaDeIa({
  supabase,
  empresa,
  recurso,
}: {
  supabase: Cliente;
  empresa: Pick<Tables<"organizations">, "id" | "plan">;
  recurso: RecursoDeIa;
}): Promise<CotaDeIa> {
  const limite = limiteDeIa(empresa.plan, recurso);
  const { data, error } = await supabase.rpc("uso_de_ia_no_mes", {
    p_org: empresa.id,
    p_feature: recurso,
  });
  if (error) throw new Error("Não foi possível conferir a franquia de IA.");
  const usados = data ?? 0;
  return { limite, usados, restantes: Math.max(0, limite - usados) };
}

/** O pedaço de `response.usage` (beta ou não) que interessa para a contagem. */
export type UsoDaApi = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  /** Escrita de cache: cobrada a 1,25x. Com cache automático, é a maior parte da entrada. */
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

/** Soma o uso de várias chamadas (o laço do assistente faz mais de uma por pergunta). */
export function somarUso(usos: UsoDaApi | UsoDaApi[]) {
  const lista = Array.isArray(usos) ? usos : [usos];
  const zero = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    web_searches: 0,
  };
  return lista.reduce<typeof zero>(
    (total, u) => ({
      input_tokens: total.input_tokens + (u.input_tokens ?? 0),
      output_tokens: total.output_tokens + (u.output_tokens ?? 0),
      cache_read_tokens: total.cache_read_tokens + (u.cache_read_input_tokens ?? 0),
      cache_creation_tokens: total.cache_creation_tokens + (u.cache_creation_input_tokens ?? 0),
      web_searches: total.web_searches + (u.server_tool_use?.web_search_requests ?? 0),
    }),
    zero,
  );
}

export type ReservaDeIa =
  | { ok: true; ids: number[] }
  /** A franquia do mês não cobre o pedido. `restantes` é quanto ainda cabe (0 = acabou). */
  | { ok: false; restantes: number; mensagem: string };

/**
 * Reserva `unidades` usos da franquia ANTES de chamar a API (1 por pergunta ao
 * assistente; 1 por despesa enviada à classificação). O banco
 * (public.reservar_uso_de_ia) põe os pedidos da empresa numa fila, conta o mês
 * no fuso dela e recusa o que passar do limite do plano — então pedidos em
 * paralelo não furam a franquia.
 *
 * Devolve `{ ok: false }` quando a franquia não cobre; lança erro em qualquer
 * outra falha (sem reserva, a IA não roda).
 */
export async function reservarUsoDeIa({
  supabase,
  empresa,
  recurso,
  unidades = 1,
}: {
  supabase: Cliente;
  empresa: Pick<Tables<"organizations">, "id" | "plan">;
  recurso: RecursoDeIa;
  unidades?: number;
}): Promise<ReservaDeIa> {
  const { data, error } = await supabase.rpc("reservar_uso_de_ia", {
    p_org: empresa.id,
    p_feature: recurso,
    p_unidades: unidades,
    p_limite: limiteDeIa(empresa.plan, recurso),
  });
  if (error) {
    if (/franquia de IA/i.test(error.message)) {
      const restantes = Number.parseInt(error.details ?? "", 10);
      return {
        ok: false,
        restantes: Number.isFinite(restantes) && restantes > 0 ? restantes : 0,
        mensagem: error.message,
      };
    }
    throw new Error("Não foi possível conferir a franquia de IA.");
  }
  if (!data?.length) throw new Error("Não foi possível conferir a franquia de IA.");
  return { ok: true, ids: data };
}

/**
 * Grava os tokens de uma reserva (na primeira linha dela). Passe sempre o TOTAL
 * acumulado das chamadas da pergunta ou do lote: dá para chamar a cada volta, e
 * o banco nunca diminui um número já gravado. Devolve se encontrou a reserva.
 */
export async function atualizarUsoDeIa({
  supabase,
  ids,
  usage,
}: {
  supabase: Cliente;
  ids: number[];
  usage: UsoDaApi | UsoDaApi[];
}) {
  const total = somarUso(usage);
  const { data, error } = await supabase.rpc("atualizar_uso_de_ia", {
    p_ids: ids,
    p_input: total.input_tokens,
    p_output: total.output_tokens,
    p_cache_read: total.cache_read_tokens,
    p_cache_creation: total.cache_creation_tokens,
    p_web_searches: total.web_searches,
  });
  if (error) throw new Error("Não foi possível registrar o uso da IA.");
  return (data ?? 0) > 0;
}

/**
 * Devolve à franquia uma reserva que NÃO chegou a chamar a API (erro antes da
 * primeira chamada, ou lote de classificação que nem saiu). Usa a chave
 * secreta: se o navegador pudesse cancelar, o dono cancelaria a reserva de uma
 * resposta ainda em andamento. O banco só apaga linhas da empresa e do usuário
 * informados, com menos de 15 minutos e sem tokens.
 *
 * Nunca lança: devolver a franquia é cortesia, e a falha não deve esconder o
 * erro original. Devolve quantas unidades voltaram.
 */
export async function cancelarUsoDeIa({
  empresaId,
  userId,
  ids,
}: {
  empresaId: string;
  userId: string;
  ids: number[];
}) {
  if (ids.length === 0) return 0;
  try {
    const { data, error } = await createAdminClient().rpc("cancelar_uso_de_ia", {
      p_ids: ids,
      p_org: empresaId,
      p_user: userId,
    });
    return error ? 0 : (data ?? 0);
  } catch {
    return 0;
  }
}
