// src/lib/reports/csv.ts — CSV no padrão brasileiro: separador ";", decimal com
// vírgula, sem separador de milhar e UTF-8 com BOM (para o Excel abrir acentos).
import type { Celula, Tabela } from "./tipos";

const BOM = "﻿";

function numeroBR(valor: number) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

export function gerarCSV(
  cabecalho: string[],
  linhas: (string | number)[][],
  opcoes: { separador?: string; decimalComVirgula?: boolean } = {},
) {
  const separador = opcoes.separador ?? ";";
  const decimalComVirgula = opcoes.decimalComVirgula ?? true;

  const formatar = (v: string | number) => {
    const s =
      typeof v === "number"
        ? decimalComVirgula
          ? numeroBR(v)
          : v.toFixed(2)
        : v;
    const precisaEscapar = new RegExp(`["\r\n${separador === "\t" ? "\\t" : `\\${separador}`}]`);
    return precisaEscapar.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map(formatar).join(separador))
    .join("\r\n");

  return BOM + corpo;
}

/** Converte a célula de um relatório para o que vai no CSV. */
function celulaParaCSV(valor: Celula, tipo: string) {
  if (valor === null || valor === undefined) return "";
  if (tipo === "dinheiro" && typeof valor === "number") return valor / 100;
  return valor;
}

/** Um relatório inteiro em CSV, com linha de totais quando existir. */
export function tabelaParaCSV(tabela: Tabela, opcoes?: { separador?: string }) {
  const cabecalho = tabela.colunas.map((coluna) => coluna.rotulo);
  const linhas = tabela.linhas.map((linha) =>
    tabela.colunas.map((coluna) => celulaParaCSV(linha[coluna.chave], coluna.tipo)),
  );

  if (tabela.totais) {
    linhas.push(
      tabela.colunas.map((coluna, indice) => {
        if (indice === 0) return "TOTAL";
        const total = tabela.totais?.[coluna.chave];
        return total === undefined ? "" : coluna.tipo === "dinheiro" ? total / 100 : total;
      }),
    );
  }

  return gerarCSV(cabecalho, linhas, opcoes);
}
