import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { limiteDeIa, type RecursoDeIa } from "@/lib/planos";
import type { Database, Tables } from "@/lib/supabase/database.types";

type Cliente = SupabaseClient<Database>;

export type CotaDeIa = { limite: number; usados: number; restantes: number };

/**
 * Quanto da franquia mensal de IA a empresa já usou, no fuso dela. A conta é
 * feita no banco (public.uso_de_ia_no_mes), que exige o papel de dono.
 * Lança erro se não conseguir conferir: na dúvida, a IA não roda.
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
  server_tool_use?: { web_search_requests?: number | null } | null;
};

/** Soma o uso de várias chamadas (o laço do assistente faz mais de uma por pergunta). */
export function somarUso(usos: UsoDaApi | UsoDaApi[]) {
  const lista = Array.isArray(usos) ? usos : [usos];
  const zero = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, web_searches: 0 };
  return lista.reduce<typeof zero>(
    (total, u) => ({
      input_tokens: total.input_tokens + (u.input_tokens ?? 0),
      output_tokens: total.output_tokens + (u.output_tokens ?? 0),
      cache_read_tokens: total.cache_read_tokens + (u.cache_read_input_tokens ?? 0),
      web_searches: total.web_searches + (u.server_tool_use?.web_search_requests ?? 0),
    }),
    zero,
  );
}

/**
 * Grava UM uso (uma pergunta ao assistente ou um lote de classificação) em
 * ai_usage_logs, com os tokens somados de todas as chamadas feitas para ele.
 * Com o cliente da sessão, a RLS exige dono e `userId` igual ao usuário logado.
 */
export async function registrarUsoDeIa({
  supabase,
  empresaId,
  userId,
  recurso,
  usage,
}: {
  supabase: Cliente;
  empresaId: string;
  userId: string | null;
  recurso: RecursoDeIa;
  usage: UsoDaApi | UsoDaApi[];
}) {
  const { error } = await supabase.from("ai_usage_logs").insert({
    organization_id: empresaId,
    user_id: userId,
    feature: recurso,
    ...somarUso(usage),
  });
  if (error) throw new Error("Não foi possível registrar o uso da IA.");
}
