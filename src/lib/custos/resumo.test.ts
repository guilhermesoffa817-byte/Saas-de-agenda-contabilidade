import { describe, expect, it } from "vitest";

import { carregarMovimentoDoPeriodo, janelaDeSeisMeses, resumoDeCustosDoMes } from "./resumo";

type Linha = Record<string, unknown>;

/** Cliente falso: registra os filtros e devolve as linhas por página (`range`). */
function clienteFalso(linhas: Linha[]) {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const consulta = {
    select: (...args: unknown[]) => (chamadas.push({ metodo: "select", args }), consulta),
    eq: (...args: unknown[]) => (chamadas.push({ metodo: "eq", args }), consulta),
    gte: (...args: unknown[]) => (chamadas.push({ metodo: "gte", args }), consulta),
    lte: (...args: unknown[]) => (chamadas.push({ metodo: "lte", args }), consulta),
    order: (...args: unknown[]) => (chamadas.push({ metodo: "order", args }), consulta),
    range: async (de: number, ate: number) => {
      chamadas.push({ metodo: "range", args: [de, ate] });
      return { data: linhas.slice(de, ate + 1), error: null };
    },
  };
  const cliente = { from: (tabela: string) => (chamadas.push({ metodo: "from", args: [tabela] }), consulta) };
  return { cliente: cliente as never, chamadas };
}

function linha(dados: Partial<Linha> = {}): Linha {
  return {
    id: crypto.randomUUID(),
    kind: "despesa",
    description: "Aluguel",
    amount_cents: 100_000,
    paid_at: "2026-10-05",
    payment_method: "pix",
    appointment_id: null,
    category_id: "cat",
    categories: { name: "Aluguel do espaço", report_group: "operacional", cost_behavior: "fixo" },
    transaction_cost_overrides: null,
    ...dados,
  };
}

describe("janelaDeSeisMeses", () => {
  it("do primeiro dia de cinco meses antes ao último dia do mês", () => {
    expect(janelaDeSeisMeses("2026-02")).toEqual({ de: "2025-09-01", ate: "2026-02-28" });
    expect(janelaDeSeisMeses("2024-02")).toEqual({ de: "2023-09-01", ate: "2024-02-29" });
  });
});

describe("carregarMovimentoDoPeriodo", () => {
  it("filtra pela empresa, pelo pago e pela data de pagamento", async () => {
    const { cliente, chamadas } = clienteFalso([]);
    await carregarMovimentoDoPeriodo(cliente, "org", "2026-05-01", "2026-10-31");
    expect(chamadas).toContainEqual({ metodo: "from", args: ["transactions"] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["organization_id", "org"] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["status", "pago"] });
    expect(chamadas).toContainEqual({ metodo: "gte", args: ["paid_at", "2026-05-01"] });
    expect(chamadas).toContainEqual({ metodo: "lte", args: ["paid_at", "2026-10-31"] });
  });

  it("pagina de mil em mil até a última página", async () => {
    const linhas = Array.from({ length: 2_300 }, () => linha());
    const { cliente, chamadas } = clienteFalso(linhas);
    const { despesas } = await carregarMovimentoDoPeriodo(cliente, "org", "2026-05-01", "2026-10-31");
    expect(despesas).toHaveLength(2_300);
    expect(chamadas.filter((c) => c.metodo === "range").map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("separa receitas, lê a exceção (objeto ou lista) e ignora valor desconhecido", async () => {
    const { cliente } = clienteFalso([
      linha({ kind: "receita", amount_cents: 20_000, appointment_id: "a1", categories: null }),
      linha({
        transaction_cost_overrides: { cost_behavior: "variavel", source: "dono", reason: null },
      }),
      linha({
        transaction_cost_overrides: [{ cost_behavior: "nao_operacional", source: "ia", reason: "Juros." }],
      }),
      linha({
        categories: { name: "Outras despesas", report_group: "operacional", cost_behavior: "estranho" },
        transaction_cost_overrides: { cost_behavior: "estranho", source: "ia", reason: null },
      }),
      linha({ categories: null, category_id: null }),
    ]);
    const { despesas, receitas } = await carregarMovimentoDoPeriodo(cliente, "org", "2026-10-01", "2026-10-31");

    expect(receitas).toEqual([{ valorCents: 20_000, pagoEm: "2026-10-05", atendimentoId: "a1" }]);
    expect(despesas[0]!.excecao).toEqual({ natureza: "variavel", fonte: "dono", motivo: null });
    expect(despesas[1]!.excecao).toEqual({ natureza: "nao_operacional", fonte: "ia", motivo: "Juros." });
    expect(despesas[2]).toMatchObject({ naturezaDaCategoria: null, excecao: null });
    expect(despesas[3]).toMatchObject({ categoria: null, grupo: null, naturezaDaCategoria: null });
  });
});

describe("resumoDeCustosDoMes", () => {
  it("recusa mês fora do formato", async () => {
    const { cliente } = clienteFalso([]);
    await expect(resumoDeCustosDoMes(cliente, "org", "2026-13")).rejects.toThrow(/AAAA-MM/);
  });

  it("monta o resumo do mês pedido", async () => {
    const { cliente } = clienteFalso([
      linha({ kind: "receita", amount_cents: 500_000, categories: null }),
      linha({ amount_cents: 200_000 }),
    ]);
    const resumo = await resumoDeCustosDoMes(cliente, "org", "2026-10");
    expect(resumo).toMatchObject({ mes: "2026-10", receitaCents: 500_000, fixosCents: 200_000 });
    expect(resumo.pontoDeEquilibrioCents).toBe(200_000);
  });
});
