// src/lib/availability.test.ts
import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { gerarHorariosLivres } from "./availability";

describe("gerarHorariosLivres", () => {
  it("não oferece horário que conflita com atendimento existente", () => {
    const tz = "America/Cuiaba";
    const livres = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "12:00" }],
      ocupados: [{ start: new TZDate(2026, 9, 5, 9, 0, 0, tz), end: new TZDate(2026, 9, 5, 10, 0, 0, tz) }],
      duracaoMin: 60,
      passoMin: 60,
      agora: new Date("2026-10-01T00:00:00Z"),
    });
    expect(livres.map((h) => new TZDate(h, tz).getHours())).toEqual([8, 10, 11]);
  });
});

describe("gerarHorariosLivres — casos do dia a dia", () => {
  const tz = "America/Sao_Paulo";
  const longe = new Date("2026-10-01T00:00:00Z");

  it("respeita as duas faixas do dia (almoço fechado)", () => {
    const livres = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [
        { inicio: "08:00", fim: "12:00" },
        { inicio: "14:00", fim: "18:00" },
      ],
      ocupados: [],
      duracaoMin: 60,
      passoMin: 60,
      agora: longe,
    });

    expect(livres.map((hora) => new TZDate(hora, tz).getHours())).toEqual([
      8, 9, 10, 11, 14, 15, 16, 17,
    ]);
  });

  it("não oferece horário que termina depois de fechar", () => {
    const livres = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "09:30" }],
      ocupados: [],
      duracaoMin: 60,
      passoMin: 30,
      agora: longe,
    });

    // 08:00 e 08:30 cabem; 09:00 terminaria 10:00, depois do fechamento.
    expect(livres.map((hora) => new TZDate(hora, tz).getMinutes())).toEqual([0, 30]);
    expect(livres).toHaveLength(2);
  });

  it("considera a folga do profissional como horário ocupado", () => {
    const livres = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "12:00" }],
      ocupados: [
        { start: new TZDate(2026, 9, 5, 10, 0, 0, tz), end: new TZDate(2026, 9, 5, 12, 0, 0, tz) },
      ],
      duracaoMin: 60,
      passoMin: 60,
      agora: longe,
    });

    expect(livres.map((hora) => new TZDate(hora, tz).getHours())).toEqual([8, 9]);
  });

  it("guarda a antecedência mínima a partir de agora", () => {
    const livres = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "12:00" }],
      ocupados: [],
      duracaoMin: 60,
      passoMin: 60,
      // 08:10 no horário de Brasília
      agora: new Date("2026-10-05T11:10:00Z"),
      antecedenciaMinimaMin: 60,
    });

    // Com 1 hora de antecedência, o primeiro horário possível é 10:00.
    expect(livres.map((hora) => new TZDate(hora, tz).getHours())).toEqual([10, 11]);
  });

  it("usa o fuso da empresa, e não o do servidor", () => {
    const emCuiaba = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: "America/Cuiaba",
      expediente: [{ inicio: "08:00", fim: "09:00" }],
      ocupados: [],
      duracaoMin: 60,
      passoMin: 60,
      agora: longe,
    });

    expect(emCuiaba).toHaveLength(1);
    // 08:00 em Cuiabá (GMT-4) é 12:00 UTC.
    expect(emCuiaba[0].getTime()).toBe(Date.UTC(2026, 9, 5, 12, 0, 0));
  });

  it("não oferece nada quando o dia está fechado", () => {
    const livres = gerarHorariosLivres({
      dia: "2026-10-04",
      timezone: tz,
      expediente: [],
      ocupados: [],
      duracaoMin: 30,
      agora: longe,
    });

    expect(livres).toEqual([]);
  });

  it("o buffer do serviço entra na duração e derruba o horário seguinte", () => {
    const semBuffer = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "10:00" }],
      ocupados: [],
      duracaoMin: 60,
      passoMin: 60,
      agora: longe,
    });
    const comBuffer = gerarHorariosLivres({
      dia: "2026-10-05",
      timezone: tz,
      expediente: [{ inicio: "08:00", fim: "10:00" }],
      ocupados: [],
      duracaoMin: 75, // 60 de atendimento + 15 de limpeza
      passoMin: 60,
      agora: longe,
    });

    expect(semBuffer).toHaveLength(2);
    expect(comBuffer).toHaveLength(1);
  });
});
