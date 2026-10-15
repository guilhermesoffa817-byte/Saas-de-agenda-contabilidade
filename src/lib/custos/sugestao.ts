import { eRetirada, type DespesaParaCusto, type Natureza } from "./calculo";
import { classificarPorRegra, motivoDaRegraParaGravar } from "./regras";

/**
 * Planeja o botão "Sugerir classificação": quais despesas do mês precisam de
 * sugestão, quais a regra resolve sem sair do servidor e quais sobram para a IA.
 */

/** Precisa de sugestão: sem exceção, categoria sem comportamento e não é retirada. */
export function precisaDeSugestao(despesa: DespesaParaCusto) {
  return !despesa.excecao && !despesa.naturezaDaCategoria && !eRetirada(despesa);
}

export type ExcecaoParaGravar = {
  transaction_id: string;
  organization_id: string;
  cost_behavior: Natureza;
  source: "regra";
  reason: string;
};

export type PlanoDeSugestao = {
  porRegra: ExcecaoParaGravar[];
  /** Maiores primeiro: se a franquia não der para todas, as que mais pesam vão antes. */
  paraIa: DespesaParaCusto[];
};

export function planejarSugestao(params: {
  empresaId: string;
  mes: string;
  despesas: DespesaParaCusto[];
}): PlanoDeSugestao {
  const porRegra: ExcecaoParaGravar[] = [];
  const paraIa: DespesaParaCusto[] = [];
  for (const despesa of params.despesas) {
    if (despesa.pagoEm.slice(0, 7) !== params.mes || !precisaDeSugestao(despesa)) continue;
    const regra = classificarPorRegra({ descricao: despesa.descricao, categoria: despesa.categoria });
    if (regra) {
      porRegra.push({
        transaction_id: despesa.id,
        organization_id: params.empresaId,
        cost_behavior: regra.natureza,
        source: "regra",
        reason: motivoDaRegraParaGravar(regra.motivo),
      });
    } else {
      paraIa.push(despesa);
    }
  }
  paraIa.sort((a, b) => b.valorCents - a.valorCents);
  return { porRegra, paraIa };
}

export type MotivoSemIa = "nao_configurada" | "franquia" | "proxima_rodada" | "erro";

/** Por que sobrou despesa sem classificação depois de chamar a IA. */
export function motivoDoQueSobrou(params: {
  erroDaIa: string | null;
  enviados: number;
  total: number;
  /** A franquia do mês não cobria todas as despesas pedidas. */
  limitadoPelaFranquia: boolean;
  /** A divisão de um lote recusado parou no prazo do clique. */
  interrompido?: boolean;
}): MotivoSemIa {
  if (params.erroDaIa) return "erro";
  if (params.enviados < params.total) {
    return params.limitadoPelaFranquia ? "franquia" : "proxima_rodada";
  }
  if (params.interrompido) return "proxima_rodada";
  // Tudo foi enviado, mas o modelo deixou algum item sem resposta.
  return "erro";
}

const despesas = (n: number) => (n === 1 ? "1 despesa" : `${n} despesas`);

/** Frase do resultado, para o toast. */
export function resumoDaSugestao(params: {
  porRegra: number;
  porIa: number;
  /** Sem classificação por falta de IA, franquia, prazo ou erro (fora as recusadas). */
  semIa: number;
  motivoSemIa: MotivoSemIa | null;
  /** Isoladas e recusadas pela IA: só o dono classifica. */
  recusadas?: number;
}) {
  const recusadas = params.recusadas ?? 0;
  const partes: string[] = [];
  if (params.porRegra > 0) {
    partes.push(
      params.porRegra === 1 ? "1 despesa classificada por regra" : `${params.porRegra} despesas classificadas por regra`,
    );
  }
  if (params.porIa > 0) {
    partes.push(
      params.porIa === 1 ? "1 sugestão da IA" : `${params.porIa} sugestões da IA`,
    );
  }
  if (partes.length === 0 && params.semIa === 0 && recusadas === 0) {
    return "Nenhuma despesa nova para classificar.";
  }
  let frase = partes.length > 0 ? `${partes.join(" e ")}.` : "";
  if (params.semIa > 0) {
    const restam = params.semIa === 1 ? "1 despesa ficou" : `${params.semIa} despesas ficaram`;
    if (params.motivoSemIa === "nao_configurada") {
      frase += ` ${restam} sem classificação: a IA não está configurada, então só as regras foram aplicadas.`;
    } else if (params.motivoSemIa === "franquia") {
      frase += ` ${restam} sem classificação: a franquia de IA do mês acabou.`;
    } else if (params.motivoSemIa === "proxima_rodada") {
      frase += ` ${restam} para a próxima rodada: clique de novo para continuar.`;
    } else {
      frase += ` ${restam} sem classificação. Classifique na tabela ou tente de novo.`;
    }
  }
  if (recusadas > 0) {
    frase += ` A IA não sugeriu classificação para ${despesas(recusadas)}: classifique na tabela.`;
  }
  return frase.trim();
}

/** O texto ao lado do botão "Sugerir classificação". */
export function textoDasPendentes(params: { total: number; pendentes: number }) {
  if (params.total === 0) return "Nenhuma despesa paga neste mês para classificar.";
  if (params.pendentes === 0) return "Todas as despesas do mês já estão classificadas.";
  return params.pendentes === 1
    ? "1 despesa sem classificação."
    : `${params.pendentes} despesas sem classificação.`;
}
