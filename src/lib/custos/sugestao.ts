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
  source: "ia";
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
        source: "ia",
        reason: motivoDaRegraParaGravar(regra.motivo),
      });
    } else {
      paraIa.push(despesa);
    }
  }
  paraIa.sort((a, b) => b.valorCents - a.valorCents);
  return { porRegra, paraIa };
}

/**
 * Linhas de `ai_usage_logs` para um lote: cada lançamento enviado conta 1 na
 * franquia; os tokens da chamada ficam na primeira linha.
 */
export function linhasDeUso(params: {
  empresaId: string;
  userId: string | null;
  enviados: number;
  tokens: { input_tokens: number; output_tokens: number; cache_read_tokens: number; web_searches: number };
}) {
  return Array.from({ length: params.enviados }, (_, indice) => ({
    organization_id: params.empresaId,
    user_id: params.userId,
    feature: "classificacao" as const,
    ...(indice === 0
      ? params.tokens
      : { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, web_searches: 0 }),
  }));
}

export type MotivoSemIa = "nao_configurada" | "franquia" | "proxima_rodada" | "erro";

/** Por que sobrou despesa sem classificação depois de chamar a IA. */
export function motivoDoQueSobrou(params: {
  erroDaIa: string | null;
  enviados: number;
  total: number;
  restantes: number;
}): MotivoSemIa {
  if (params.erroDaIa) return "erro";
  if (params.enviados < params.total) {
    return params.enviados >= params.restantes ? "franquia" : "proxima_rodada";
  }
  // Tudo foi enviado, mas o modelo deixou algum item sem resposta.
  return "erro";
}

/** Frase do resultado, para o toast. */
export function resumoDaSugestao(params: {
  porRegra: number;
  porIa: number;
  semIa: number;
  motivoSemIa: MotivoSemIa | null;
}) {
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
  if (partes.length === 0 && params.semIa === 0) return "Nenhuma despesa nova para classificar.";
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
  return frase.trim();
}
