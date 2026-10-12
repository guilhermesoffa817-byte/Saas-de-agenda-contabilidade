import { describe, expect, it } from "vitest";
import {
  ALERTAS_LIMITE_MEI,
  ESTAGIO_DURACAO_MAX_MESES,
  LIMITE_MEI_ANUAL_CENTS,
  LIMITE_MEI_POR_MES_CENTS,
  MEI_MAX_EMPREGADOS,
} from "@/lib/fiscal/constantes";

describe("constantes fiscais", () => {
  it("guarda os limites do MEI em centavos inteiros", () => {
    expect(LIMITE_MEI_ANUAL_CENTS).toBe(8_100_000);
    expect(LIMITE_MEI_POR_MES_CENTS).toBe(675_000);
    expect(Number.isInteger(LIMITE_MEI_ANUAL_CENTS)).toBe(true);
    expect(Number.isInteger(LIMITE_MEI_POR_MES_CENTS)).toBe(true);
  });

  it("mantém o limite proporcional como um doze avos do limite anual", () => {
    expect(LIMITE_MEI_POR_MES_CENTS * 12).toBe(LIMITE_MEI_ANUAL_CENTS);
  });

  it("alerta em 70% e 90% do limite", () => {
    expect(ALERTAS_LIMITE_MEI).toEqual([0.7, 0.9]);
  });
});

describe("constantes trabalhistas usadas nos alertas da equipe", () => {
  it("MEI tem no máximo um empregado e o estágio dura até dois anos", () => {
    expect(MEI_MAX_EMPREGADOS).toBe(1);
    expect(ESTAGIO_DURACAO_MAX_MESES).toBe(24);
  });
});
