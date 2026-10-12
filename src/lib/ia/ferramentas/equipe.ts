import "server-only";

import type { Enums } from "@/lib/supabase/database.types";

import { brl, esquemaMes, ferramenta, percentual, periodoDoMes } from "./base";

type Vinculo = Enums<"staff_contract">;
type TipoDePagamento = Enums<"staff_payment_kind">;

const ROTULO_VINCULO: Record<Vinculo, string> = {
  clt: "CLT (carteira assinada)",
  parceria: "Profissional-parceiro (salão-parceiro)",
  mei: "MEI prestador de serviço",
  pj: "Empresa prestadora (PJ)",
  autonomo: "Autônomo (pessoa física)",
  estagio: "Estágio",
};

const ROTULO_PAGAMENTO: Record<TipoDePagamento, string> = {
  salario: "Salário",
  comissao: "Comissão",
  cota_parte: "Cota-parte",
  repasse: "Repasse",
  bolsa: "Bolsa-auxílio",
  adiantamento: "Adiantamento",
  bonus: "Bônus",
  beneficio: "Benefício",
  encargo: "Guias de encargos",
  rescisao: "Rescisão",
  outro: "Outro",
};

export type ColaboradorDaContagem = {
  vinculo: Vinculo;
  inicio: string; // started_on
  fim: string | null; // ended_on
};

export type PagamentoDaContagem = { tipo: TipoDePagamento; valorCents: number };

/**
 * Equipe em números: quantos por vínculo e quanto foi pago no mês por tipo de
 * pagamento. Nunca nome, CPF, chave Pix nem valor de uma pessoa — só somas.
 * Os valores são os que o dono lançou (o Bossa não calcula folha nem encargo).
 */
export function contarEquipe(colaboradores: ColaboradorDaContagem[], pagamentos: PagamentoDaContagem[], mes: string) {
  const { inicio, fim } = periodoDoMes(mes);
  const ativos = colaboradores.filter((c) => c.inicio <= fim && (c.fim === null || c.fim >= inicio));

  const porVinculo = new Map<Vinculo, number>();
  for (const c of ativos) porVinculo.set(c.vinculo, (porVinculo.get(c.vinculo) ?? 0) + 1);

  const porTipo = new Map<TipoDePagamento, number>();
  for (const p of pagamentos) porTipo.set(p.tipo, (porTipo.get(p.tipo) ?? 0) + p.valorCents);
  const total = pagamentos.reduce((soma, p) => soma + p.valorCents, 0);

  return {
    mes,
    base: "Pagamentos que o dono registrou na Equipe com este mês de referência. O Bossa não calcula folha nem encargos.",
    colaboradores_ativos_no_mes: ativos.length,
    por_vinculo: [...porVinculo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([vinculo, quantidade]) => ({ vinculo: ROTULO_VINCULO[vinculo], quantidade })),
    total_pago_a_equipe: brl(total),
    por_tipo_de_pagamento: [...porTipo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, cents]) => ({ tipo: ROTULO_PAGAMENTO[tipo], ...brl(cents), participacao: percentual(cents, total) })),
    pagamentos_registrados: pagamentos.length,
  };
}

export const equipeEmNumeros = ferramenta({
  nome: "equipe_em_numeros",
  descricao:
    "Equipe no mês: quantos colaboradores ativos por tipo de vínculo e quanto foi pago à equipe por tipo de pagamento (salário, comissão, cota-parte, bolsa…), só em totais. Nunca traz nome nem valor de uma pessoa. Use para perguntas sobre o peso da equipe nos custos.",
  status: "Somando os pagamentos da equipe…",
  esquema: esquemaMes,
  async executar({ mes }, ctx) {
    const [colaboradores, pagamentos] = await Promise.all([
      ctx.supabase
        .from("staff_members")
        .select("contract, started_on, ended_on")
        .eq("organization_id", ctx.empresa.id)
        .is("anonymized_at", null),
      ctx.supabase
        .from("staff_payments")
        .select("kind, amount_cents")
        .eq("organization_id", ctx.empresa.id)
        .eq("reference_month", `${mes}-01`),
    ]);
    if (colaboradores.error) throw new Error(colaboradores.error.message);
    if (pagamentos.error) throw new Error(pagamentos.error.message);

    return contarEquipe(
      (colaboradores.data ?? []).map((c) => ({ vinculo: c.contract, inicio: c.started_on, fim: c.ended_on })),
      (pagamentos.data ?? []).map((p) => ({ tipo: p.kind, valorCents: p.amount_cents })),
      mes,
    );
  },
});
