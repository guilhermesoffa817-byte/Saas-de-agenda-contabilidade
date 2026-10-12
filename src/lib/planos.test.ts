import { describe, expect, it } from "vitest";

import {
  CLASSIFICACOES_IA_NO_TESTE,
  ORDEM_DOS_PLANOS,
  PERGUNTAS_IA_NO_TESTE,
  PLANOS,
  PLANO_DESTACADO,
  limiteDeIa,
} from "./planos";

describe("franquias de IA por plano", () => {
  it("perguntas ao assistente por plano", () => {
    expect(limiteDeIa("essencial", "assistente")).toBe(20);
    expect(limiteDeIa("profissional", "assistente")).toBe(60);
    expect(limiteDeIa("negocio", "assistente")).toBe(200);
  });

  it("despesas classificadas por plano", () => {
    expect(limiteDeIa("essencial", "classificacao")).toBe(100);
    expect(limiteDeIa("profissional", "classificacao")).toBe(300);
    expect(limiteDeIa("negocio", "classificacao")).toBe(1000);
  });

  it("o teste grátis tem teto próprio, menor que o do plano do meio", () => {
    expect(limiteDeIa("trial", "assistente")).toBe(PERGUNTAS_IA_NO_TESTE);
    expect(limiteDeIa(null, "assistente")).toBe(PERGUNTAS_IA_NO_TESTE);
    expect(limiteDeIa(undefined, "classificacao")).toBe(CLASSIFICACOES_IA_NO_TESTE);
    expect(PERGUNTAS_IA_NO_TESTE).toBeLessThan(PLANOS[PLANO_DESTACADO].perguntasIaMes);
    expect(CLASSIFICACOES_IA_NO_TESTE).toBeLessThan(PLANOS[PLANO_DESTACADO].classificacoesIaMes);
  });

  it("plano desconhecido não ganha IA", () => {
    expect(limiteDeIa("premium", "assistente")).toBe(0);
    expect(limiteDeIa("premium", "classificacao")).toBe(0);
  });

  it("plano maior nunca dá menos que o menor", () => {
    for (let i = 1; i < ORDEM_DOS_PLANOS.length; i++) {
      const menor = PLANOS[ORDEM_DOS_PLANOS[i - 1]];
      const maior = PLANOS[ORDEM_DOS_PLANOS[i]];
      expect(maior.perguntasIaMes).toBeGreaterThan(menor.perguntasIaMes);
      expect(maior.classificacoesIaMes).toBeGreaterThan(menor.classificacoesIaMes);
    }
  });
});
