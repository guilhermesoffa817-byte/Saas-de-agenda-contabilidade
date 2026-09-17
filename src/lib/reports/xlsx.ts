import ExcelJS from "exceljs";

import type { Tabela } from "./tipos";

const VERDE = "FF0F3D2E";
const PAPEL = "FFFBF9F4";

/** O mesmo relatório em Excel, com dinheiro em coluna de moeda e datas de verdade. */
export async function tabelaParaExcel(tabela: Tabela) {
  const livro = new ExcelJS.Workbook();
  livro.creator = "Alicerce";
  livro.created = new Date();

  const aba = livro.addWorksheet(tabela.titulo.slice(0, 31), {
    views: [{ state: "frozen", ySplit: tabela.resumo?.length ? 0 : 1 }],
  });

  aba.addRow([tabela.titulo]).font = { bold: true, size: 14 };
  if (tabela.subtitulo) {
    aba.addRow([tabela.subtitulo]).font = { italic: true, color: { argb: "FF5B605B" } };
  }
  aba.addRow([]);

  if (tabela.resumo?.length) {
    for (const item of tabela.resumo) {
      const linha = aba.addRow([item.rotulo, item.valorCents / 100]);
      linha.getCell(1).font = { bold: item.destaque };
      const celula = linha.getCell(2);
      celula.numFmt = 'R$ #,##0.00';
      celula.font = { bold: item.destaque };
    }
    aba.addRow([]);
  }

  const cabecalho = aba.addRow(tabela.colunas.map((coluna) => coluna.rotulo));
  cabecalho.font = { bold: true, color: { argb: PAPEL } };
  cabecalho.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  });

  for (const linha of tabela.linhas) {
    const valores = tabela.colunas.map((coluna) => {
      const valor = linha[coluna.chave];
      if (valor === null || valor === undefined) return null;
      if (coluna.tipo === "dinheiro" && typeof valor === "number") return valor / 100;
      if (coluna.tipo === "data" && typeof valor === "string") return new Date(`${valor}T12:00:00Z`);
      return valor;
    });

    const criada = aba.addRow(valores);
    tabela.colunas.forEach((coluna, indice) => {
      const celula = criada.getCell(indice + 1);
      if (coluna.tipo === "dinheiro") celula.numFmt = 'R$ #,##0.00';
      if (coluna.tipo === "data") celula.numFmt = "dd/mm/yyyy";
    });
  }

  if (tabela.totais) {
    const valores = tabela.colunas.map((coluna, indice) => {
      if (indice === 0) return "TOTAL";
      const total = tabela.totais?.[coluna.chave];
      if (total === undefined) return null;
      return coluna.tipo === "dinheiro" ? total / 100 : total;
    });
    const linha = aba.addRow(valores);
    linha.font = { bold: true };
    tabela.colunas.forEach((coluna, indice) => {
      if (coluna.tipo === "dinheiro") linha.getCell(indice + 1).numFmt = 'R$ #,##0.00';
    });
  }

  if (tabela.avisos?.length) {
    aba.addRow([]);
    for (const aviso of tabela.avisos) {
      aba.addRow([aviso]).font = { italic: true, color: { argb: "FF5B605B" } };
    }
  }

  tabela.colunas.forEach((coluna, indice) => {
    const larguras: Record<string, number> = { texto: 34, dinheiro: 16, data: 12, numero: 12 };
    aba.getColumn(indice + 1).width = larguras[coluna.tipo] ?? 18;
  });

  const conteudo = await livro.xlsx.writeBuffer();
  return Buffer.from(conteudo);
}
