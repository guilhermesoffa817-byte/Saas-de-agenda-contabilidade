import { describe, expect, it } from "vitest";

import { faixaDaGrade, minutosDoDia, minutosParaHora } from "./agenda";

describe("minutosDoDia", () => {
  it("lê a hora no fuso da empresa", () => {
    expect(minutosDoDia("2026-10-05T12:00:00Z", "America/Sao_Paulo")).toBe(9 * 60);
    expect(minutosDoDia("2026-10-05T12:00:00Z", "America/Cuiaba")).toBe(8 * 60);
    expect(minutosDoDia("2026-10-05T12:30:00Z", "America/Manaus")).toBe(8 * 60 + 30);
  });
});

describe("minutosParaHora", () => {
  it("formata com dois dígitos", () => {
    expect(minutosParaHora(0)).toBe("00:00");
    expect(minutosParaHora(9 * 60 + 5)).toBe("09:05");
    expect(minutosParaHora(23 * 60 + 59)).toBe("23:59");
  });
});

describe("faixaDaGrade", () => {
  it("arredonda para horas cheias em volta do expediente", () => {
    const faixa = faixaDaGrade({
      expediente: [{ inicio: 8 * 60 + 30, fim: 18 * 60 + 30 }],
      atendimentos: [],
      bloqueios: [],
    });
    expect(faixa).toEqual({ inicio: 8 * 60, fim: 19 * 60 });
  });

  it("estica quando existe atendimento fora do expediente", () => {
    const faixa = faixaDaGrade({
      expediente: [{ inicio: 9 * 60, fim: 18 * 60 }],
      atendimentos: [{ inicioMin: 7 * 60 + 30, fimMin: 8 * 60 }],
      bloqueios: [{ inicioMin: 19 * 60, fimMin: 20 * 60 + 15 }],
    });
    expect(faixa).toEqual({ inicio: 7 * 60, fim: 21 * 60 });
  });

  it("tem faixa padrão quando o dia está fechado e vazio", () => {
    expect(faixaDaGrade({ expediente: [], atendimentos: [], bloqueios: [] })).toEqual({
      inicio: 8 * 60,
      fim: 18 * 60,
    });
  });
});
