import "server-only";

import { z } from "zod";

import { ALERTAS_LIMITE_MEI, LIMITE_MEI_ANUAL_CENTS, LIMITE_MEI_POR_MES_CENTS } from "@/lib/fiscal/constantes";

import { brl, buscarTodas, ferramenta, percentual, AVISO_CORTADO } from "./base";

/**
 * Teto do MEI no ano, com a mesma regra do termômetro do Financeiro: no ano de
 * abertura o limite é proporcional aos meses de atividade (contando o mês de
 * abertura). Os valores legais vêm só de src/lib/fiscal/constantes.ts.
 */
export function limiteDoAno(ano: number, aberturaEm: string | null) {
  if (aberturaEm) {
    const abertura = new Date(`${aberturaEm}T12:00:00Z`);
    if (abertura.getUTCFullYear() === ano) {
      return { limiteCents: LIMITE_MEI_POR_MES_CENTS * (12 - abertura.getUTCMonth()), proporcional: true };
    }
  }
  return { limiteCents: LIMITE_MEI_ANUAL_CENTS, proporcional: false };
}

export function avaliarLimiteDoMei(params: { recebidoCents: number; hoje: string; aberturaEm: string | null }) {
  const ano = Number(params.hoje.slice(0, 4));
  const { limiteCents, proporcional } = limiteDoAno(ano, params.aberturaEm);
  const fracao = limiteCents > 0 ? params.recebidoCents / limiteCents : 0;
  const alerta = [...ALERTAS_LIMITE_MEI].reverse().find((nivel) => fracao >= nivel);
  return {
    aplica: true,
    ano,
    ate: params.hoje,
    base: "Receitas pagas no ano até hoje (regime de caixa), o mesmo cálculo do termômetro do Financeiro. O teto vem da tabela de valores legais do Bossa.",
    receita_bruta_no_ano: brl(params.recebidoCents),
    limite_do_ano: brl(limiteCents),
    limite_proporcional_ao_ano_de_abertura: proporcional,
    usado_do_limite: percentual(params.recebidoCents, limiteCents) ?? "0%",
    falta_para_o_limite: brl(Math.max(0, limiteCents - params.recebidoCents)),
    passou_do_limite: params.recebidoCents > limiteCents,
    alerta:
      alerta === undefined
        ? null
        : `A receita do ano passou de ${percentual(alerta, 1)} do limite. Converse com o contador sobre o enquadramento.`,
    lembrete:
      "O que fazer ao chegar perto do limite (desenquadramento, troca de regime) é decisão do contador; o assistente não orienta sobre isso.",
  };
}

export const limiteDoMei = ferramenta({
  nome: "limite_do_mei",
  descricao:
    "Só para empresas MEI: receita bruta recebida no ano até hoje comparada com o teto anual do MEI (valor oficial cadastrado no Bossa). Use sempre que a pergunta envolver o limite do MEI; nunca cite o teto de memória.",
  status: "Conferindo o limite do MEI…",
  esquema: z.object({}),
  async executar(_entrada, ctx) {
    if (ctx.empresa.tax_regime !== "mei") {
      return {
        aplica: false,
        mensagem: "A empresa não está cadastrada como MEI no Bossa; o limite anual do MEI não se aplica.",
      };
    }
    const ano = ctx.hoje.slice(0, 4);
    const { linhas, cortado } = await buscarTodas<{ amount_cents: number }>((de, ate) =>
      ctx.supabase
        .from("transactions")
        .select("amount_cents")
        .eq("organization_id", ctx.empresa.id)
        .eq("kind", "receita")
        .eq("status", "pago")
        .gte("paid_at", `${ano}-01-01`)
        .lte("paid_at", ctx.hoje)
        .order("id")
        .range(de, ate),
    );
    const recebidoCents = linhas.reduce((soma, l) => soma + l.amount_cents, 0);
    const resultado = avaliarLimiteDoMei({ recebidoCents, hoje: ctx.hoje, aberturaEm: ctx.empresa.opened_on });
    return cortado ? { ...resultado, aviso: AVISO_CORTADO } : resultado;
  },
});
