import "server-only";

import { ROTULO_DA_NATUREZA } from "@/lib/custos/calculo";
import { resumoDeCustosDoMes, type ResumoDeCustos } from "@/lib/custos/resumo";

import { brl, esquemaMes, ferramenta, percentual } from "./base";

const SITUACAO_DO_EQUILIBRIO: Record<ResumoDeCustos["situacaoDoPontoDeEquilibrio"], string> = {
  calculado: "Calculado.",
  sem_custos_fixos: "Não há custo fixo classificado no mês; não há ponto de equilíbrio a calcular.",
  sem_receita: "Nada entrou no mês; não dá para calcular.",
  margem_insuficiente: "Com a margem atual, os custos variáveis já consomem tudo o que entra.",
};

/** Pontos-base (10.000 = 100%) como texto ("42,5%"). */
const bps = (valor: number | null) => (valor === null ? null : percentual(valor, 10_000));

export const CATEGORIAS_NO_RESUMO = 12;

/**
 * O resumo de custos do jeito que vai para o modelo: totais e indicadores em
 * centavos com o texto em R$, e as despesas somadas por categoria. Nenhuma
 * descrição de lançamento sai daqui (a de salário, por exemplo, traz o nome).
 */
export function custosParaOModelo(r: ResumoDeCustos) {
  const categorias = new Map<string, { categoria: string; natureza: string; cents: number; lancamentos: number }>();
  for (const d of r.despesas) {
    const natureza = d.natureza ? ROTULO_DA_NATUREZA[d.natureza] : "Sem classificação";
    const categoria = d.categoria ?? "Sem categoria";
    const chave = `${categoria}|${natureza}`;
    const atual = categorias.get(chave) ?? { categoria, natureza, cents: 0, lancamentos: 0 };
    atual.cents += d.valorCents;
    atual.lancamentos += 1;
    categorias.set(chave, atual);
  }
  const custoTotal = r.fixosCents + r.variaveisCents + r.foraDaOperacaoCents + r.semClassificacaoCents;

  return {
    mes: r.mes,
    base: "Visão gerencial dos custos pagos no mês (regime de caixa), pela classificação fixo/variável/fora da operação. Não substitui o resumo contábil do contador. Retirada do dono não é custo.",
    receita: brl(r.receitaCents),
    custos_fixos: brl(r.fixosCents),
    custos_variaveis: brl(r.variaveisCents),
    fora_da_operacao: brl(r.foraDaOperacaoCents),
    sem_classificacao: { ...brl(r.semClassificacaoCents), lancamentos: r.quantidadeSemClassificacao },
    retiradas_do_dono_fora_da_conta: brl(r.retiradasCents),
    margem_de_contribuicao: brl(r.margemDeContribuicaoCents),
    indice_de_margem: bps(r.indiceDeMargemBps),
    de_cada_100_reais_que_entram_sobram: r.sobraACadaCemReaisCents === null ? null : brl(r.sobraACadaCemReaisCents),
    peso_dos_custos_fixos_na_receita: bps(r.pesoDosFixosBps),
    ponto_de_equilibrio: {
      situacao: SITUACAO_DO_EQUILIBRIO[r.situacaoDoPontoDeEquilibrio],
      faturamento_mensal_necessario: r.pontoDeEquilibrioCents === null ? null : brl(r.pontoDeEquilibrioCents),
      atendimentos_necessarios: r.pontoDeEquilibrioAtendimentos,
    },
    atendimentos_com_recebimento_no_mes: r.atendimentosRecebidos,
    mes_anterior: {
      mes: r.mesAnterior.mes,
      receita: brl(r.mesAnterior.receitaCents),
      custos_fixos: brl(r.mesAnterior.fixosCents),
      custos_variaveis: brl(r.mesAnterior.variaveisCents),
      margem_de_contribuicao: brl(r.mesAnterior.margemDeContribuicaoCents),
    },
    tendencia_seis_meses: r.tendencia.map((m) => ({
      mes: m.mes,
      custos_fixos: brl(m.fixosCents),
      custos_variaveis: brl(m.variaveisCents),
    })),
    por_categoria: [...categorias.values()]
      .sort((a, b) => b.cents - a.cents)
      .slice(0, CATEGORIAS_NO_RESUMO)
      .map((c) => ({
        categoria: c.categoria,
        natureza: c.natureza,
        ...brl(c.cents),
        participacao: percentual(c.cents, custoTotal),
        lancamentos: c.lancamentos,
      })),
  };
}

export const custosOperacionais = ferramenta({
  nome: "custos_operacionais",
  descricao:
    "Custos do mês separados em fixos, variáveis e fora da operação (visão gerencial), com margem de contribuição, ponto de equilíbrio (quanto faturar para empatar), comparação com o mês anterior, tendência de seis meses e totais por categoria. Use para perguntas sobre custo fixo, quanto precisa faturar e peso dos custos.",
  status: "Lendo os custos do mês…",
  esquema: esquemaMes,
  async executar({ mes }, ctx) {
    return custosParaOModelo(await resumoDeCustosDoMes(ctx.supabase, ctx.empresa.id, mes));
  },
});
