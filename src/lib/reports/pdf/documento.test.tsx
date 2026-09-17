import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { DocumentoDeRelatorio } from "./documento";
import { montarDRE } from "../dre";
import { montarReceitasMEI } from "../receitas-mei";
import type { LancamentoParaRelatorio } from "../tipos";

function lancamento(dados: Partial<LancamentoParaRelatorio>): LancamentoParaRelatorio {
  return {
    id: crypto.randomUUID(),
    tipo: "receita",
    situacao: "pago",
    descricao: "Escova + hidratação — Marina Alves",
    valorCents: 12000,
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
    documentoDoCliente: "12345678901",
    tipoDeReceita: "servico",
    notaFiscalEmitida: false,
    reciboSaudeEmitido: false,
    comprovante: null,
    ...dados,
  };
}

const empresa = { nome: "Studio Ana Ribeiro", documento: "12345678000199" };

describe("DocumentoDeRelatorio", () => {
  it("gera um PDF de verdade para o resumo do mês", async () => {
    const tabela = montarDRE({
      periodo: "setembro de 2026",
      lancamentos: [
        lancamento({}),
        lancamento({ tipo: "despesa", categoria: "Aluguel do espaço", valorCents: 150000 }),
      ],
    });

    const arquivo = await renderToBuffer(
      <DocumentoDeRelatorio tabela={tabela} empresa={empresa} geradoEm="30/09/2026 às 18:00" />,
    );

    expect(arquivo.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(arquivo.length).toBeGreaterThan(1000);
  }, 30_000);

  it("gera o relatório do MEI em paisagem, com 12 meses e sem quebrar", async () => {
    const tabela = montarReceitasMEI({ ano: 2026, lancamentos: [lancamento({})] });

    const arquivo = await renderToBuffer(
      <DocumentoDeRelatorio tabela={tabela} empresa={empresa} geradoEm="30/09/2026 às 18:00" />,
    );

    expect(arquivo.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("não quebra quando o período está vazio", async () => {
    const tabela = montarDRE({ periodo: "setembro de 2026", lancamentos: [] });
    const arquivo = await renderToBuffer(
      <DocumentoDeRelatorio tabela={tabela} empresa={empresa} geradoEm="30/09/2026" />,
    );
    expect(arquivo.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
