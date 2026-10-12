import "server-only";

import { resumoDeCustosDoMes, type ResumoDeCustos } from "@/lib/custos/resumo";
import { iaConfigurada } from "@/lib/ia/cliente";
import { cotaDeIa, type CotaDeIa } from "@/lib/ia/cota";
import { createClient } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/supabase/sessao";

export type TelaDeCustos = {
  resumo: ResumoDeCustos;
  /** `null` quando a IA não está configurada ou a franquia não pôde ser conferida. */
  cota: CotaDeIa | null;
  iaConfigurada: boolean;
};

export async function carregarTelaDeCustos(empresa: Empresa, mes: string): Promise<TelaDeCustos> {
  const supabase = await createClient();
  const configurada = iaConfigurada();
  const [resumo, cota] = await Promise.all([
    resumoDeCustosDoMes(supabase, empresa.id, mes),
    configurada
      ? cotaDeIa({ supabase, empresa, recurso: "classificacao" }).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { resumo, cota, iaConfigurada: configurada };
}
