import type { LancamentoParaRelatorio, Tabela } from "./tipos";

/**
 * Livro-Caixa do trabalhador autônomo (base do Carnê-Leão).
 * Regra da Receita: vale a data do PAGAMENTO, não a competência. As receitas
 * ficam separadas por pagador pessoa física e pessoa jurídica, e a dedução é
 * limitada ao rendimento do mês — quando passa, o relatório avisa.
 */
export function montarLivroCaixa(params: {
  lancamentos: LancamentoParaRelatorio[];
  periodo: string;
}): Tabela {
  const pagos = params.lancamentos
    .filter((item) => item.situacao === "pago" && item.pagoEm)
    .sort((a, b) => (a.pagoEm! < b.pagoEm! ? -1 : a.pagoEm! > b.pagoEm! ? 1 : 0));

  const linhas = pagos.map((item) => ({
    data: item.pagoEm,
    historico: item.descricao,
    receitaPF: item.tipo === "receita" && item.pagador !== "pj" ? item.valorCents : null,
    receitaPJ: item.tipo === "receita" && item.pagador === "pj" ? item.valorCents : null,
    despesa: item.tipo === "despesa" ? item.valorCents : null,
    dedutivel: item.tipo === "despesa" ? (item.dedutivelSugerido ? "Sim (sugestão)" : "Não") : "",
  }));

  const somar = (chave: "receitaPF" | "receitaPJ" | "despesa") =>
    linhas.reduce((soma, linha) => soma + (Number(linha[chave]) || 0), 0);

  const receitaPF = somar("receitaPF");
  const receitaPJ = somar("receitaPJ");
  const despesaTotal = somar("despesa");

  const dedutiveis = pagos
    .filter((item) => item.tipo === "despesa" && item.dedutivelSugerido)
    .reduce((soma, item) => soma + item.valorCents, 0);

  const receitaTotal = receitaPF + receitaPJ;
  const avisos: string[] = [
    "A marcação de dedutível é sugestão do sistema. A confirmação é do seu contador.",
  ];

  if (dedutiveis > receitaTotal) {
    avisos.unshift(
      "As despesas dedutíveis do período passaram da receita. No Carnê-Leão a dedução é limitada ao rendimento do mês: o excedente não pode ser deduzido aqui.",
    );
  }

  return {
    titulo: "Livro-Caixa",
    subtitulo: `${params.periodo} · pela data de pagamento`,
    colunas: [
      { chave: "data", rotulo: "Data", tipo: "data" },
      { chave: "historico", rotulo: "Histórico", tipo: "texto" },
      { chave: "receitaPF", rotulo: "Receita de PF", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "receitaPJ", rotulo: "Receita de PJ", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "despesa", rotulo: "Despesa", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "dedutivel", rotulo: "Dedutível", tipo: "texto" },
    ],
    linhas,
    totais: { receitaPF, receitaPJ, despesa: despesaTotal },
    resumo: [
      { rotulo: "Receita de pessoas físicas", valorCents: receitaPF },
      { rotulo: "Receita de empresas", valorCents: receitaPJ },
      { rotulo: "Despesas do período", valorCents: despesaTotal, negativo: true },
      { rotulo: "Despesas com sugestão de dedutível", valorCents: dedutiveis },
      { rotulo: "Resultado pelo caixa", valorCents: receitaTotal - despesaTotal, destaque: true },
    ],
    avisos,
  };
}
