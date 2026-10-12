import { describe, expect, it } from "vitest";

import { colunasDoComportamento, esquemaCategoria } from "./financeiro";

describe("comportamento do custo na categoria", () => {
  it("o dono escolhe: grava o valor com a origem 'dono'", () => {
    expect(colunasDoComportamento({ tipo: "despesa", grupo: "operacional", comportamento: "fixo" })).toEqual({
      cost_behavior: "fixo",
      cost_behavior_source: "dono",
    });
    expect(colunasDoComportamento({ tipo: "despesa", grupo: "imposto", comportamento: "sem" })).toEqual({
      cost_behavior: null,
      cost_behavior_source: "dono",
    });
  });

  it("sem escolha, a categoria fica como estava", () => {
    expect(colunasDoComportamento({ tipo: "despesa", grupo: "operacional" })).toEqual({});
  });

  it("entrada e retirada do dono nunca têm comportamento", () => {
    expect(colunasDoComportamento({ tipo: "receita", grupo: "operacional", comportamento: "fixo" })).toEqual({
      cost_behavior: null,
    });
    expect(colunasDoComportamento({ tipo: "despesa", grupo: "retirada", comportamento: "variavel" })).toEqual({
      cost_behavior: null,
    });
  });

  it("o esquema aceita só os valores do banco (mais 'sem')", () => {
    const base = { nome: "Lavanderia", tipo: "despesa", grupo: "operacional", sugestaoDedutivel: false };
    expect(esquemaCategoria.safeParse({ ...base, comportamento: "variavel" }).success).toBe(true);
    expect(esquemaCategoria.safeParse(base).success).toBe(true);
    expect(esquemaCategoria.safeParse({ ...base, comportamento: "semivariavel" }).success).toBe(false);
  });
});
