import type { LancamentoParaRelatorio, Tabela } from "./tipos";

/** Contas a pagar e a receber, com atrasados e previsão de caixa de 30 dias. */
export function montarContas(params: {
  lancamentos: LancamentoParaRelatorio[];
  hoje: string;
  dias?: number;
}): Tabela {
  const dias = params.dias ?? 30;
  const limite = new Date(`${params.hoje}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + dias);
  const limiteISO = limite.toISOString().slice(0, 10);

  const abertos = params.lancamentos
    .filter((item) => item.situacao === "pendente" && item.vencimento)
    .filter((item) => item.vencimento! <= limiteISO)
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : 1));

  const linhas = abertos.map((item) => ({
    vencimento: item.vencimento,
    historico: item.descricao,
    categoria: item.categoria ?? "—",
    aReceber: item.tipo === "receita" ? item.valorCents : null,
    aPagar: item.tipo === "despesa" ? item.valorCents : null,
    situacao: item.vencimento! < params.hoje ? "Atrasado" : "A vencer",
  }));

  const somar = (chave: "aReceber" | "aPagar", filtro?: (linha: (typeof linhas)[number]) => boolean) =>
    linhas
      .filter((linha) => (filtro ? filtro(linha) : true))
      .reduce((soma, linha) => soma + (Number(linha[chave]) || 0), 0);

  const aReceber = somar("aReceber");
  const aPagar = somar("aPagar");
  const atrasadoReceber = somar("aReceber", (linha) => linha.situacao === "Atrasado");
  const atrasadoPagar = somar("aPagar", (linha) => linha.situacao === "Atrasado");

  return {
    titulo: "Contas a pagar e a receber",
    subtitulo: `Próximos ${dias} dias, contando de ${params.hoje.split("-").reverse().join("/")}`,
    colunas: [
      { chave: "vencimento", rotulo: "Vencimento", tipo: "data" },
      { chave: "historico", rotulo: "Histórico", tipo: "texto" },
      { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
      { chave: "situacao", rotulo: "Situação", tipo: "texto" },
      { chave: "aReceber", rotulo: "A receber", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "aPagar", rotulo: "A pagar", tipo: "dinheiro", alinhamento: "direita" },
    ],
    linhas,
    totais: { aReceber, aPagar },
    resumo: [
      { rotulo: "A receber no período", valorCents: aReceber },
      { rotulo: "A pagar no período", valorCents: aPagar, negativo: true },
      { rotulo: "Previsão de caixa", valorCents: aReceber - aPagar, destaque: true },
      { rotulo: "Recebimentos atrasados", valorCents: atrasadoReceber },
      { rotulo: "Pagamentos atrasados", valorCents: atrasadoPagar, negativo: true },
    ],
  };
}
