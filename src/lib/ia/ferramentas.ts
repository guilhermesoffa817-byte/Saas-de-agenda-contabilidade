import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { Tables } from "@/lib/supabase/database.types";

import { agendaEOcupacao } from "./ferramentas/agenda";
import type { ContextoFerramenta, Ferramenta } from "./ferramentas/base";
import { clientesEmNumeros } from "./ferramentas/clientes";
import { custosOperacionais } from "./ferramentas/custos";
import { equipeEmNumeros } from "./ferramentas/equipe";
import { resumoFinanceiro } from "./ferramentas/financeiro";
import { limiteDoMei } from "./ferramentas/mei";
import { desempenhoDosServicos } from "./ferramentas/servicos";

export type { ContextoFerramenta } from "./ferramentas/base";

/**
 * Ferramentas do assistente. Todas só LEEM, com o cliente do Supabase da sessão
 * do dono (a RLS vale) e a empresa vinda do servidor — nunca da entrada do modelo.
 *
 * A ordem e o texto daqui fazem parte do pedido à API: mudar invalida o cache e,
 * no Opus 5.5, o raciocínio guardado das conversas abertas. Mexa com cuidado.
 */
export const FERRAMENTAS: Ferramenta[] = [
  resumoFinanceiro,
  desempenhoDosServicos,
  agendaEOcupacao,
  clientesEmNumeros,
  custosOperacionais,
  equipeEmNumeros,
  limiteDoMei,
] as Ferramenta[];

const PorNome = new Map(FERRAMENTAS.map((f) => [f.nome, f]));

export const NOME_DA_PESQUISA = "web_search";
export const MAXIMO_DE_PESQUISAS = 5;

/** O que a tela mostra enquanto cada ferramenta roda. */
export function statusDaFerramenta(nome: string) {
  if (nome === NOME_DA_PESQUISA) return "Pesquisando tendências…";
  return PorNome.get(nome)?.status ?? null;
}

/** JSON Schema da entrada: mantém descrições; sem `strict`, quem valida é o Zod daqui. */
function paraInputSchema(esquema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const schema = z.toJSONSchema(esquema) as Record<string, unknown>;
  delete schema.$schema;
  return { ...schema, type: "object" };
}

type EmpresaDaPesquisa = Pick<Tables<"organizations">, "city" | "state" | "timezone">;

/**
 * Lista de ferramentas enviada à API. Depende só de dados estáveis da empresa
 * (cidade, UF e fuso), para ficar idêntica entre os pedidos de uma conversa.
 * A pesquisa na web recebe só a localização aproximada — nunca o nome da empresa.
 */
export function ferramentasDaApi(empresa: EmpresaDaPesquisa): Anthropic.Beta.BetaToolUnion[] {
  const cidade = empresa.city?.trim() || null;
  const uf = empresa.state?.trim().toUpperCase() || null;
  return [
    ...FERRAMENTAS.map((f) => ({
      name: f.nome,
      description: f.descricao,
      input_schema: paraInputSchema(f.esquema),
    })),
    {
      type: "web_search_20260209",
      name: NOME_DA_PESQUISA,
      max_uses: MAXIMO_DE_PESQUISAS,
      user_location: {
        type: "approximate",
        country: "BR",
        timezone: empresa.timezone,
        ...(cidade ? { city: cidade } : {}),
        ...(uf ? { region: uf } : {}),
      },
    },
  ];
}

export type ResultadoDeFerramenta = Anthropic.Beta.BetaToolResultBlockParam;

/** Roda uma ferramenta pedida pelo modelo. Entrada inválida ou falha viram `is_error`, nunca exceção. */
export async function executarFerramenta(
  bloco: Pick<Anthropic.Beta.BetaToolUseBlock, "id" | "name" | "input">,
  ctx: ContextoFerramenta,
): Promise<ResultadoDeFerramenta> {
  const f = PorNome.get(bloco.name);
  if (!f) {
    return { type: "tool_result", tool_use_id: bloco.id, is_error: true, content: `Ferramenta desconhecida: ${bloco.name}.` };
  }
  const entrada = f.esquema.safeParse(bloco.input ?? {});
  if (!entrada.success) {
    const motivo = entrada.error.issues.map((i) => i.message).join(" ");
    return { type: "tool_result", tool_use_id: bloco.id, is_error: true, content: `Entrada inválida: ${motivo}` };
  }
  try {
    const dados = await f.executar(entrada.data, ctx);
    return { type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(dados) };
  } catch {
    return {
      type: "tool_result",
      tool_use_id: bloco.id,
      is_error: true,
      content: "Falha ao consultar os dados do Bossa. Diga ao usuário que não foi possível ler esses números agora.",
    };
  }
}
