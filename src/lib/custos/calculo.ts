import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { origemDaExcecao } from "./regras";

/**
 * Custos operacionais: visão gerencial, não contábil. Tudo aqui é função pura,
 * em centavos inteiros. Multiplicação de dois valores em centavos passa por
 * BigInt, porque R$ 1 milhão × R$ 1 milhão já estoura o inteiro seguro do JS.
 */

/** Os mesmos valores de `transaction_cost_overrides.source`. */
export type FonteDaExcecao = "ia" | "regra" | "dono";

/** Os mesmos valores da coluna `cost_behavior` do banco. */
export const NATUREZAS = ["fixo", "variavel", "nao_operacional"] as const;
export type Natureza = (typeof NATUREZAS)[number];

export const ROTULO_DA_NATUREZA: Record<Natureza, string> = {
  fixo: "Fixo",
  variavel: "Variável",
  nao_operacional: "Fora da operação",
};

/** De onde veio a natureza de uma despesa, na ordem em que vence. */
export type OrigemDaNatureza = "dono" | "ia" | "regra" | "categoria";

export const ROTULO_DA_ORIGEM: Record<OrigemDaNatureza, string> = {
  dono: "Você",
  ia: "Sugestão da IA",
  regra: "Regra",
  categoria: "Categoria",
};

export function eNatureza(valor: unknown): valor is Natureza {
  return typeof valor === "string" && (NATUREZAS as readonly string[]).includes(valor);
}

/** Uma despesa paga, do jeito que sai do banco (já sem o join). */
export type DespesaParaCusto = {
  id: string;
  descricao: string;
  valorCents: number;
  /** Dia do pagamento, `yyyy-MM-dd` (regime de caixa). */
  pagoEm: string;
  formaDePagamento: string | null;
  categoria: string | null;
  categoriaId: string | null;
  /**
   * Cliente ligado ao lançamento (reembolso, sinal devolvido). Com cliente, a
   * descrição nunca vai à IA. Opcional para quem monta despesas sem o banco.
   */
  clienteId?: string | null;
  /** `report_group` da categoria; sem categoria conta como operacional. */
  grupo: string | null;
  naturezaDaCategoria: Natureza | null;
  excecao: { natureza: Natureza; fonte: FonteDaExcecao; motivo: string | null } | null;
};

export type DespesaClassificada = DespesaParaCusto & {
  natureza: Natureza | null;
  origem: OrigemDaNatureza | null;
  motivo: string | null;
};

/** Retirada do dono não é custo: fica fora da análise. */
export function eRetirada(despesa: Pick<DespesaParaCusto, "grupo">) {
  return despesa.grupo === "retirada";
}

/** Exceção do lançamento (o dono vence a IA) > comportamento da categoria > nada. */
export function classificar(despesa: DespesaParaCusto): DespesaClassificada {
  if (despesa.excecao) {
    return {
      ...despesa,
      natureza: despesa.excecao.natureza,
      origem: origemDaExcecao(despesa.excecao.fonte, despesa.excecao.motivo),
      motivo: despesa.excecao.motivo,
    };
  }
  if (despesa.naturezaDaCategoria) {
    return { ...despesa, natureza: despesa.naturezaDaCategoria, origem: "categoria", motivo: null };
  }
  return { ...despesa, natureza: null, origem: null, motivo: null };
}

export type TotaisDeCustos = {
  receitaCents: number;
  fixosCents: number;
  variaveisCents: number;
  foraDaOperacaoCents: number;
  semClassificacaoCents: number;
  /** Só informação: retirada não entra em nenhuma conta de custo. */
  retiradasCents: number;
  quantidadeSemClassificacao: number;
  /** Atendimentos com recebimento no mês (distintos). */
  atendimentosRecebidos: number;
};

export function somarCustos(params: {
  despesas: DespesaClassificada[];
  receitaCents: number;
  atendimentosRecebidos: number;
}): TotaisDeCustos {
  const totais: TotaisDeCustos = {
    receitaCents: params.receitaCents,
    fixosCents: 0,
    variaveisCents: 0,
    foraDaOperacaoCents: 0,
    semClassificacaoCents: 0,
    retiradasCents: 0,
    quantidadeSemClassificacao: 0,
    atendimentosRecebidos: params.atendimentosRecebidos,
  };
  for (const despesa of params.despesas) {
    if (eRetirada(despesa)) totais.retiradasCents += despesa.valorCents;
    else if (despesa.natureza === "fixo") totais.fixosCents += despesa.valorCents;
    else if (despesa.natureza === "variavel") totais.variaveisCents += despesa.valorCents;
    else if (despesa.natureza === "nao_operacional") totais.foraDaOperacaoCents += despesa.valorCents;
    else {
      totais.semClassificacaoCents += despesa.valorCents;
      totais.quantidadeSemClassificacao += 1;
    }
  }
  return totais;
}

/** Divisão inteira arredondada para cima; `d` precisa ser positivo e `n` não negativo. */
export function dividirParaCima(n: bigint, d: bigint): bigint {
  if (d <= BigInt(0)) throw new Error("Divisor precisa ser positivo.");
  if (n <= BigInt(0)) return BigInt(0);
  return (n + d - BigInt(1)) / d;
}

/** Divisão inteira com arredondamento comercial (meio vai para longe do zero); `d` positivo. */
export function dividirArredondando(n: bigint, d: bigint): bigint {
  if (d <= BigInt(0)) throw new Error("Divisor precisa ser positivo.");
  const negativo = n < BigInt(0);
  const absoluto = negativo ? -n : n;
  const resultado = (absoluto * BigInt(2) + d) / (d * BigInt(2));
  return negativo ? -resultado : resultado;
}

const DEZ_MIL = BigInt(10_000);

export type SituacaoDoPontoDeEquilibrio =
  | "calculado"
  /** Sem custo fixo classificado no mês: não há o que cobrir. */
  | "sem_custos_fixos"
  /** Nada entrou no mês. */
  | "sem_receita"
  /** Os custos variáveis já consomem tudo o que entra. */
  | "margem_insuficiente";

export type IndicadoresDeCustos = {
  /** Receita − custos variáveis. */
  margemDeContribuicaoCents: number;
  /** Margem ÷ receita, em pontos-base (10.000 = 100%). `null` sem receita. */
  indiceDeMargemBps: number | null;
  /**
   * "De cada R$ 100 que entram, sobram R$ X": X em centavos. Numericamente é o
   * próprio índice em pontos-base (R$ 100 = 10.000 centavos), mas fica com nome
   * próprio para ninguém precisar lembrar disso.
   */
  sobraACadaCemReaisCents: number | null;
  situacaoDoPontoDeEquilibrio: SituacaoDoPontoDeEquilibrio;
  /** ceil(fixos × receita ÷ margem). */
  pontoDeEquilibrioCents: number | null;
  /** ceil(fixos ÷ margem média por atendimento), quando houve atendimento recebido. */
  pontoDeEquilibrioAtendimentos: number | null;
  /** Custos fixos ÷ receita, em pontos-base. */
  pesoDosFixosBps: number | null;
};

export function calcularIndicadores(totais: TotaisDeCustos): IndicadoresDeCustos {
  const receita = BigInt(totais.receitaCents);
  const fixos = BigInt(totais.fixosCents);
  const margem = receita - BigInt(totais.variaveisCents);
  const temReceita = totais.receitaCents > 0;

  const indiceDeMargemBps = temReceita ? Number(dividirArredondando(margem * DEZ_MIL, receita)) : null;
  const pesoDosFixosBps = temReceita ? Number(dividirArredondando(fixos * DEZ_MIL, receita)) : null;

  let situacao: SituacaoDoPontoDeEquilibrio;
  if (totais.fixosCents <= 0) situacao = "sem_custos_fixos";
  else if (!temReceita) situacao = "sem_receita";
  else if (margem <= BigInt(0)) situacao = "margem_insuficiente";
  else situacao = "calculado";

  let pontoDeEquilibrioCents: number | null = null;
  let pontoDeEquilibrioAtendimentos: number | null = null;
  if (situacao === "calculado") {
    pontoDeEquilibrioCents = Number(dividirParaCima(fixos * receita, margem));
    if (totais.atendimentosRecebidos > 0) {
      // fixos ÷ (margem ÷ n) = fixos × n ÷ margem, sem perder centavo na média.
      pontoDeEquilibrioAtendimentos = Number(
        dividirParaCima(fixos * BigInt(totais.atendimentosRecebidos), margem),
      );
    }
  }

  return {
    margemDeContribuicaoCents: Number(margem),
    indiceDeMargemBps,
    sobraACadaCemReaisCents: indiceDeMargemBps,
    situacaoDoPontoDeEquilibrio: situacao,
    pontoDeEquilibrioCents,
    pontoDeEquilibrioAtendimentos,
    pesoDosFixosBps,
  };
}

/** `yyyy-MM` → `yyyy-MM` do mês somado (negativo volta). */
export function deslocarMes(mes: string, meses: number) {
  return format(addMonths(new Date(`${mes}-01T12:00:00Z`), meses), "yyyy-MM");
}

export type MesDaTendencia = {
  mes: string;
  rotulo: string;
  fixosCents: number;
  variaveisCents: number;
};

/** Fixos × variáveis dos seis meses que terminam em `mesFinal`. */
export function tendenciaDeSeisMeses(
  despesas: DespesaClassificada[],
  mesFinal: string,
): MesDaTendencia[] {
  const meses: MesDaTendencia[] = Array.from({ length: 6 }, (_, indice) => {
    const mes = deslocarMes(mesFinal, indice - 5);
    return {
      mes,
      rotulo: format(new Date(`${mes}-01T12:00:00Z`), "MMM", { locale: ptBR }).replace(".", ""),
      fixosCents: 0,
      variaveisCents: 0,
    };
  });
  const porMes = new Map(meses.map((item) => [item.mes, item]));
  for (const despesa of despesas) {
    if (eRetirada(despesa)) continue;
    const alvo = porMes.get(despesa.pagoEm.slice(0, 7));
    if (!alvo) continue;
    if (despesa.natureza === "fixo") alvo.fixosCents += despesa.valorCents;
    else if (despesa.natureza === "variavel") alvo.variaveisCents += despesa.valorCents;
  }
  return meses;
}

export type ComparacaoComMesAnterior = {
  mes: string;
  receitaCents: number;
  fixosCents: number;
  variaveisCents: number;
  foraDaOperacaoCents: number;
  margemDeContribuicaoCents: number;
  /** Atual − anterior, em centavos. */
  diferencaReceitaCents: number;
  diferencaFixosCents: number;
  diferencaVariaveisCents: number;
  diferencaMargemCents: number;
};

export function compararComMesAnterior(params: {
  mesAnterior: string;
  atual: TotaisDeCustos;
  anterior: TotaisDeCustos;
}): ComparacaoComMesAnterior {
  const { atual, anterior } = params;
  const margemAtual = atual.receitaCents - atual.variaveisCents;
  const margemAnterior = anterior.receitaCents - anterior.variaveisCents;
  return {
    mes: params.mesAnterior,
    receitaCents: anterior.receitaCents,
    fixosCents: anterior.fixosCents,
    variaveisCents: anterior.variaveisCents,
    foraDaOperacaoCents: anterior.foraDaOperacaoCents,
    margemDeContribuicaoCents: margemAnterior,
    diferencaReceitaCents: atual.receitaCents - anterior.receitaCents,
    diferencaFixosCents: atual.fixosCents - anterior.fixosCents,
    diferencaVariaveisCents: atual.variaveisCents - anterior.variaveisCents,
    diferencaMargemCents: margemAtual - margemAnterior,
  };
}

/** Uma receita paga: só o necessário para somar e contar atendimentos. */
export type ReceitaParaCusto = { valorCents: number; pagoEm: string; atendimentoId: string | null };

export function receitaDoMes(receitas: ReceitaParaCusto[], mes: string) {
  let receitaCents = 0;
  const atendimentos = new Set<string>();
  for (const receita of receitas) {
    if (receita.pagoEm.slice(0, 7) !== mes) continue;
    receitaCents += receita.valorCents;
    if (receita.atendimentoId) atendimentos.add(receita.atendimentoId);
  }
  return { receitaCents, atendimentosRecebidos: atendimentos.size };
}

export type ResumoDeCustos = TotaisDeCustos &
  IndicadoresDeCustos & {
    /** `yyyy-MM`. */
    mes: string;
    mesAnterior: ComparacaoComMesAnterior;
    tendencia: MesDaTendencia[];
    /** Despesas pagas no mês, já classificadas, fora as retiradas. Maiores primeiro. */
    despesas: DespesaClassificada[];
  };

/** Junta tudo: recebe seis meses de movimento e devolve o resumo do último. */
export function montarResumoDeCustos(params: {
  mes: string;
  despesas: DespesaParaCusto[];
  receitas: ReceitaParaCusto[];
}): ResumoDeCustos {
  const { mes } = params;
  const mesAnterior = deslocarMes(mes, -1);
  const classificadas = params.despesas.map(classificar);

  const doMes = (alvo: string) => classificadas.filter((item) => item.pagoEm.slice(0, 7) === alvo);
  const totais = (alvo: string) =>
    somarCustos({ despesas: doMes(alvo), ...receitaDoMes(params.receitas, alvo) });

  const atual = totais(mes);
  const anterior = totais(mesAnterior);

  return {
    mes,
    ...atual,
    ...calcularIndicadores(atual),
    mesAnterior: compararComMesAnterior({ mesAnterior, atual, anterior }),
    tendencia: tendenciaDeSeisMeses(classificadas, mes),
    despesas: doMes(mes)
      .filter((item) => !eRetirada(item))
      .sort((a, b) => b.valorCents - a.valorCents || a.pagoEm.localeCompare(b.pagoEm)),
  };
}
