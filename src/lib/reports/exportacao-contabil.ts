import { gerarCSV } from "./csv";
import type { LancamentoParaRelatorio } from "./tipos";

/**
 * Exportação para o sistema do contador. Cada sistema (Domínio, Alterdata,
 * Questor...) tem leiaute próprio e muda entre versões, então nada é chutado
 * aqui: o contador escolhe as colunas, o separador e o formato de data.
 */
export const COLUNAS_DISPONIVEIS = [
  { chave: "data", rotulo: "Data" },
  { chave: "conta_debito", rotulo: "Conta débito" },
  { chave: "conta_credito", rotulo: "Conta crédito" },
  { chave: "valor", rotulo: "Valor" },
  { chave: "historico", rotulo: "Histórico" },
  { chave: "documento", rotulo: "Documento" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "forma_pagamento", rotulo: "Forma de pagamento" },
] as const;

export type ChaveDeColuna = (typeof COLUNAS_DISPONIVEIS)[number]["chave"];

export type ModeloDeExportacao = {
  colunas: ChaveDeColuna[];
  separador: string;
  formatoDeData: "dd/MM/yyyy" | "yyyy-MM-dd" | "ddMMyyyy";
  decimalComVirgula: boolean;
};

export const MODELO_PADRAO: ModeloDeExportacao = {
  colunas: ["data", "historico", "valor", "conta_debito", "conta_credito"],
  separador: ";",
  formatoDeData: "dd/MM/yyyy",
  decimalComVirgula: true,
};

function formatarData(iso: string, formato: ModeloDeExportacao["formatoDeData"]) {
  const [ano, mes, dia] = iso.split("-");
  if (formato === "yyyy-MM-dd") return iso;
  if (formato === "ddMMyyyy") return `${dia}${mes}${ano}`;
  return `${dia}/${mes}/${ano}`;
}

/**
 * Partida simples com o código do plano de contas que o contador cadastrou:
 * na receita, a conta bancária é o débito e a categoria é o crédito; na despesa,
 * o contrário. Sem código cadastrado, a célula sai vazia — nunca inventada.
 */
function contas(lancamento: LancamentoParaRelatorio) {
  const categoria = lancamento.codigoDaCategoria ?? "";
  const conta = lancamento.codigoDaConta ?? "";
  return lancamento.tipo === "receita"
    ? { debito: conta, credito: categoria }
    : { debito: categoria, credito: conta };
}

export function gerarExportacaoContabil(params: {
  lancamentos: LancamentoParaRelatorio[];
  modelo?: ModeloDeExportacao;
}) {
  const modelo = params.modelo ?? MODELO_PADRAO;

  const pagos = params.lancamentos
    .filter((item) => item.situacao === "pago" && item.pagoEm)
    .sort((a, b) => (a.pagoEm! < b.pagoEm! ? -1 : 1));

  const cabecalho = modelo.colunas.map(
    (chave) => COLUNAS_DISPONIVEIS.find((coluna) => coluna.chave === chave)?.rotulo ?? chave,
  );

  const linhas = pagos.map((lancamento) => {
    const { debito, credito } = contas(lancamento);

    const valores: Record<ChaveDeColuna, string | number> = {
      data: formatarData(lancamento.pagoEm!, modelo.formatoDeData),
      conta_debito: debito,
      conta_credito: credito,
      valor: lancamento.valorCents / 100,
      historico: lancamento.descricao,
      documento: lancamento.documentoDoCliente ?? "",
      categoria: lancamento.categoria ?? "",
      forma_pagamento: lancamento.formaDePagamento ?? "",
    };

    return modelo.colunas.map((chave) => valores[chave]);
  });

  return gerarCSV(cabecalho, linhas, {
    separador: modelo.separador,
    decimalComVirgula: modelo.decimalComVirgula,
  });
}
