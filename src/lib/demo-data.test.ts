import { describe, expect, it } from "vitest";

import { FINANCEIRO_DEMO, lancamentosDemo } from "./demo-data";
import { montarDRE } from "./reports/dre";

describe("dados de demonstração", () => {
  const lancamentos = lancamentosDemo();
  const somar = (filtro: (item: (typeof lancamentos)[number]) => boolean) =>
    lancamentos.filter(filtro).reduce((soma, item) => soma + item.valorCents, 0);

  it("o mês de agosto fecha positivo, senão a página de vendas mente", () => {
    const tabela = montarDRE({ lancamentos, periodo: "agosto de 2026" });
    const resultado = tabela.resumo?.find((item) => item.destaque)?.valorCents ?? 0;
    const sobrou = tabela.resumo?.find((item) => item.rotulo === "Sobrou depois das retiradas");

    expect(resultado).toBeGreaterThan(0);
    expect(sobrou?.valorCents ?? 0).toBeGreaterThan(0);
    expect(tabela.avisos).toBeUndefined();
  });

  it("o cartão do financeiro e o gráfico contam a mesma história dos lançamentos", () => {
    const receitas = somar((item) => item.tipo === "receita");
    const despesas = somar((item) => item.tipo === "despesa" && item.grupo !== "retirada");
    const agosto = FINANCEIRO_DEMO.seisMeses.at(-1);

    expect(FINANCEIRO_DEMO.entrouCents).toBe(receitas);
    expect(FINANCEIRO_DEMO.saiuCents).toBe(despesas);
    expect(agosto?.mes).toBe("2026-08");
    expect(agosto?.entrouCents).toBe(receitas);
    expect(agosto?.saiuCents).toBe(despesas);
  });

  it("todo valor é centavo inteiro e positivo", () => {
    for (const item of lancamentos) {
      expect(Number.isInteger(item.valorCents)).toBe(true);
      expect(item.valorCents).toBeGreaterThan(0);
    }
  });

  it("o salão não abre no domingo", () => {
    const domingos = lancamentos
      .filter((item) => item.tipo === "receita")
      .filter((item) => new Date(`${item.competencia}T12:00:00Z`).getUTCDay() === 0);

    expect(domingos).toHaveLength(0);
  });

  it("as maiores despesas do gráfico existem de verdade nos lançamentos", () => {
    for (const despesa of FINANCEIRO_DEMO.maioresDespesas) {
      const total = somar(
        (item) => item.tipo === "despesa" && item.categoria === despesa.categoria,
      );
      expect(total, despesa.categoria).toBe(despesa.valorCents);
    }
  });
});
