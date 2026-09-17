import type { LancamentoParaRelatorio, Tabela } from "./tipos";

const ROTULO_DO_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * Relatório mensal de receitas brutas do MEI.
 * Separa serviços, revenda de mercadorias e produtos industrializados, e dentro
 * de cada um o que teve e o que não teve nota fiscal — que é o formato do
 * relatório que o MEI precisa guardar todo mês.
 */
export function montarReceitasMEI(params: {
  lancamentos: LancamentoParaRelatorio[];
  ano: number;
}): Tabela {
  const receitas = params.lancamentos.filter(
    (item) => item.tipo === "receita" && item.situacao === "pago" && item.pagoEm,
  );

  const linhas = Array.from({ length: 12 }, (_, indice) => {
    const doMes = receitas.filter((item) => Number(item.pagoEm!.slice(5, 7)) === indice + 1);

    const somar = (tipo: LancamentoParaRelatorio["tipoDeReceita"], comNota: boolean) =>
      doMes
        .filter((item) => item.tipoDeReceita === tipo && item.notaFiscalEmitida === comNota)
        .reduce((soma, item) => soma + item.valorCents, 0);

    const servicoComNota = somar("servico", true);
    const servicoSemNota = somar("servico", false);
    const revendaComNota = somar("revenda", true);
    const revendaSemNota = somar("revenda", false);
    const industrializadoComNota = somar("industrializado", true);
    const industrializadoSemNota = somar("industrializado", false);

    return {
      mes: ROTULO_DO_MES[indice],
      servicoComNota,
      servicoSemNota,
      revendaComNota,
      revendaSemNota,
      industrializadoComNota,
      industrializadoSemNota,
      total:
        servicoComNota +
        servicoSemNota +
        revendaComNota +
        revendaSemNota +
        industrializadoComNota +
        industrializadoSemNota,
    };
  });

  const totalDe = (chave: keyof (typeof linhas)[number]) =>
    linhas.reduce((soma, linha) => soma + (Number(linha[chave]) || 0), 0);

  return {
    titulo: "Receitas brutas do MEI",
    subtitulo: `Ano de ${params.ano} · pela data de recebimento`,
    colunas: [
      { chave: "mes", rotulo: "Mês", tipo: "texto" },
      { chave: "servicoComNota", rotulo: "Serviços com nota", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "servicoSemNota", rotulo: "Serviços sem nota", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "revendaComNota", rotulo: "Revenda com nota", tipo: "dinheiro", alinhamento: "direita" },
      { chave: "revendaSemNota", rotulo: "Revenda sem nota", tipo: "dinheiro", alinhamento: "direita" },
      {
        chave: "industrializadoComNota",
        rotulo: "Industrializados com nota",
        tipo: "dinheiro",
        alinhamento: "direita",
      },
      {
        chave: "industrializadoSemNota",
        rotulo: "Industrializados sem nota",
        tipo: "dinheiro",
        alinhamento: "direita",
      },
      { chave: "total", rotulo: "Total do mês", tipo: "dinheiro", alinhamento: "direita" },
    ],
    linhas,
    totais: {
      servicoComNota: totalDe("servicoComNota"),
      servicoSemNota: totalDe("servicoSemNota"),
      revendaComNota: totalDe("revendaComNota"),
      revendaSemNota: totalDe("revendaSemNota"),
      industrializadoComNota: totalDe("industrializadoComNota"),
      industrializadoSemNota: totalDe("industrializadoSemNota"),
      total: totalDe("total"),
    },
    avisos: [
      "Guarde este relatório com as notas fiscais do mês. O Alicerce não calcula o DAS nem substitui a declaração anual.",
    ],
  };
}

/** Recebimentos de pacientes pessoa física ainda sem recibo do Receita Saúde. */
export function montarReceitaSaudePendentes(params: {
  lancamentos: LancamentoParaRelatorio[];
  periodo: string;
}): Tabela {
  const pendentes = params.lancamentos.filter(
    (item) =>
      item.tipo === "receita" &&
      item.situacao === "pago" &&
      item.pagador !== "pj" &&
      !item.reciboSaudeEmitido,
  );

  return {
    titulo: "Recibos do Receita Saúde pendentes",
    subtitulo: params.periodo,
    colunas: [
      { chave: "data", rotulo: "Data", tipo: "data" },
      { chave: "paciente", rotulo: "Paciente", tipo: "texto" },
      { chave: "documento", rotulo: "CPF", tipo: "texto" },
      { chave: "valor", rotulo: "Valor", tipo: "dinheiro", alinhamento: "direita" },
    ],
    linhas: pendentes.map((item) => ({
      data: item.pagoEm,
      paciente: item.cliente ?? "—",
      documento: item.documentoDoCliente ?? "não informado",
      valor: item.valorCents,
      id: item.id,
    })),
    totais: {
      valor: pendentes.reduce((soma, item) => soma + item.valorCents, 0),
    },
    avisos: [
      "O recibo é emitido por você no app Receita Saúde, no Carnê-Leão Web ou no e-CAC. A Receita Federal não oferece integração: o Alicerce apenas lista o que falta.",
    ],
  };
}
