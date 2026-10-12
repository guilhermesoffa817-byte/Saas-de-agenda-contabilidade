import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DespesaParaCusto } from "@/lib/custos/calculo";

const parse = vi.fn();

vi.mock("./cliente", async (original) => {
  const real = await original<typeof import("./cliente")>();
  return { ...real, anthropic: () => ({ beta: { messages: { parse } } }) };
});

const {
  chaveDaDescricao,
  classificarLote,
  descricoesAnteriores,
  emLotes,
  interpretarResposta,
  montarLote,
  SISTEMA_DA_CLASSIFICACAO,
  TAMANHO_DO_LOTE,
} = await import("./classificar-custos");

let sequencia = 0;
function despesa(dados: Partial<DespesaParaCusto> = {}): DespesaParaCusto {
  sequencia += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequencia).padStart(12, "0")}`,
    descricao: "Lavanderia",
    valorCents: 12_345,
    pagoEm: "2026-10-10",
    formaDePagamento: "pix",
    categoria: "Outras despesas",
    categoriaId: "cat",
    grupo: "operacional",
    naturezaDaCategoria: null,
    excecao: null,
    ...dados,
  };
}

beforeEach(() => {
  parse.mockReset();
});

describe("montarLote", () => {
  it("limpa dado pessoal, não manda id do banco e marca recorrência", () => {
    const a = despesa({
      descricao: "Reembolso para Ana — CPF 123.456.789-09, ana@exemplo.com.br",
      categoria: "Outras despesas",
    });
    const b = despesa({ descricao: "Lavanderia — outubro", grupo: null, formaDePagamento: null });
    const anteriores = descricoesAnteriores(
      [{ descricao: "Lavanderia — setembro", pagoEm: "2026-09-12" }],
      "2026-10",
    );

    const { itens, idPorNumero } = montarLote([a, b], anteriores);

    expect(itens[0]).toEqual({
      id: "1",
      descricao: "Reembolso para Ana — CPF [cpf], [e-mail]",
      categoria: "Outras despesas",
      grupo_no_relatorio: "operacional",
      valor_cents: 12_345,
      valor: expect.stringMatching(/^R\$\s123,45$/),
      forma_de_pagamento: "pix",
      repete_em_meses_anteriores: false,
    });
    expect(itens[1]).toMatchObject({ id: "2", grupo_no_relatorio: "operacional", repete_em_meses_anteriores: true });
    expect(JSON.stringify(itens)).not.toContain(a.id);
    expect(idPorNumero.get("1")).toBe(a.id);
    expect(idPorNumero.get("2")).toBe(b.id);
  });
});

describe("recorrência", () => {
  it("ignora mês e números na comparação", () => {
    expect(chaveDaDescricao("Aluguel — Outubro/2026")).toBe(chaveDaDescricao("aluguel setembro 2026"));
  });

  it("só conta o que foi pago antes do mês", () => {
    const anteriores = descricoesAnteriores(
      [
        { descricao: "Contador", pagoEm: "2026-09-30" },
        { descricao: "Sistema", pagoEm: "2026-10-01" },
      ],
      "2026-10",
    );
    expect(anteriores.has("contador")).toBe(true);
    expect(anteriores.has("sistema")).toBe(false);
  });
});

describe("emLotes", () => {
  it("lotes de até 60", () => {
    const lotes = emLotes(Array.from({ length: 125 }, (_, i) => i));
    expect(lotes.map((l) => l.length)).toEqual([60, 60, 5]);
    expect(TAMANHO_DO_LOTE).toBe(60);
    expect(emLotes([])).toEqual([]);
  });
});

describe("interpretarResposta", () => {
  it("descarta id inventado ou repetido e corta o motivo em 200", () => {
    const mapa = new Map([
      ["1", "tx-a"],
      ["2", "tx-b"],
    ]);
    const sugestoes = interpretarResposta(
      [
        { id: "1", natureza: "fixo", motivo: "x".repeat(250) },
        { id: "1", natureza: "variavel", motivo: "repetido" },
        { id: "9", natureza: "fixo", motivo: "inventado" },
        { id: " 2 ", natureza: "nao_operacional", motivo: "   " },
      ],
      mapa,
    );
    expect(sugestoes).toEqual([
      { transacaoId: "tx-a", natureza: "fixo", motivo: "x".repeat(200) },
      { transacaoId: "tx-b", natureza: "nao_operacional", motivo: "Sugestão da IA." },
    ]);
  });
});

describe("classificarLote", () => {
  it("chama o Opus 5.5 com fallback, effort baixo e o enum do banco", async () => {
    const a = despesa();
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { itens: [{ id: "1", natureza: "variavel", motivo: "Serviço por demanda." }] },
      usage: { input_tokens: 500, output_tokens: 80 },
    });

    const resultado = await classificarLote([a], new Set());

    expect(resultado).toEqual({
      ok: true,
      sugestoes: [{ transacaoId: a.id, natureza: "variavel", motivo: "Serviço por demanda." }],
      uso: { input_tokens: 500, output_tokens: 80 },
    });
    const [pedido] = parse.mock.calls[0]!;
    expect(pedido).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SISTEMA_DA_CLASSIFICACAO,
    });
    const schema = JSON.stringify(pedido.output_config.format.schema);
    expect(schema).toContain('"enum":["fixo","variavel","nao_operacional"]');
    expect(pedido.messages[0].content).not.toContain(a.id);
  });

  it("recusa e saída vazia viram erro em português", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null, usage: {} });
    expect(await classificarLote([despesa()], new Set())).toMatchObject({
      ok: false,
      erro: { codigo: "recusa" },
    });

    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: null, usage: {} });
    expect(await classificarLote([despesa()], new Set())).toMatchObject({
      ok: false,
      erro: { codigo: "saida", repetivel: true },
    });
  });

  it("erro do SDK é traduzido, não lançado", async () => {
    parse.mockRejectedValue(new Anthropic.AnthropicError("json cortado"));
    expect(await classificarLote([despesa()], new Set())).toMatchObject({
      ok: false,
      erro: { codigo: "saida" },
    });
  });

  it("lista vazia não chama a API; lote acima de 60 é recusado", async () => {
    expect(await classificarLote([], new Set())).toMatchObject({ ok: true, sugestoes: [] });
    const grande = Array.from({ length: 61 }, () => despesa());
    expect(await classificarLote(grande, new Set())).toMatchObject({ ok: false });
    expect(parse).not.toHaveBeenCalled();
  });
});
