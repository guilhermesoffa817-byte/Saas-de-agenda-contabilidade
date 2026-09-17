import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { montarDRE } from "./dre";
import { tabelaParaExcel } from "./xlsx";
import type { LancamentoParaRelatorio } from "./tipos";

function lancamento(dados: Partial<LancamentoParaRelatorio>): LancamentoParaRelatorio {
  return {
    id: crypto.randomUUID(),
    tipo: "receita",
    situacao: "pago",
    descricao: "Atendimentos",
    valorCents: 500000,
    competencia: "2026-09-10",
    pagoEm: "2026-09-10",
    vencimento: null,
    categoria: "Atendimentos",
    grupo: "operacional",
    dedutivelSugerido: false,
    codigoDaCategoria: null,
    conta: "Caixa",
    codigoDaConta: null,
    formaDePagamento: "pix",
    pagador: "pf",
    cliente: "Marina Alves",
    documentoDoCliente: null,
    tipoDeReceita: "servico",
    notaFiscalEmitida: false,
    reciboSaudeEmitido: false,
    comprovante: null,
    ...dados,
  };
}

describe("tabelaParaExcel", () => {
  it("grava valores como número, com formato de moeda, e o mesmo total do relatório", async () => {
    const tabela = montarDRE({
      periodo: "setembro de 2026",
      lancamentos: [
        lancamento({}),
        lancamento({ tipo: "despesa", categoria: "Aluguel do espaço", valorCents: 150000 }),
      ],
    });

    const arquivo = await tabelaParaExcel(tabela);

    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(arquivo as unknown as ArrayBuffer);
    const aba = livro.worksheets[0];

    const textos: string[] = [];
    const numeros: number[] = [];
    aba.eachRow((linha) => {
      linha.eachCell((celula) => {
        if (typeof celula.value === "number") numeros.push(celula.value);
        if (typeof celula.value === "string") textos.push(celula.value);
      });
    });

    expect(aba.name).toBe("Resumo do mês");
    expect(textos).toContain("Resumo do mês");
    expect(textos).toContain("setembro de 2026");
    expect(textos).toContain("Aluguel do espaço");
    // Dinheiro em reais, e não em centavos.
    expect(numeros).toContain(5000);
    expect(numeros).toContain(1500);
    expect(numeros).not.toContain(500000);

    // O resultado do mês do resumo aparece na planilha.
    const resultado = tabela.resumo?.find((item) => item.destaque)?.valorCents ?? 0;
    expect(numeros).toContain(resultado / 100);

    // Coluna de valor formatada como moeda.
    const formatos = new Set<string>();
    aba.eachRow((linha) => {
      linha.eachCell((celula) => {
        if (typeof celula.value === "number" && celula.numFmt) formatos.add(celula.numFmt);
      });
    });
    expect([...formatos].some((formato) => formato.includes("R$"))).toBe(true);
  }, 30_000);
});
