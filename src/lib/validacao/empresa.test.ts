import { describe, expect, it } from "vitest";

import { esquemaFaixaDoDia, esquemaServico, esquemaSlug, sugerirSlug } from "./empresa";

describe("sugerirSlug", () => {
  it("tira acento, espaço e maiúscula", () => {
    expect(sugerirSlug("Salão da Ana")).toBe("salao-da-ana");
    expect(sugerirSlug("Barbearia  Três Irmãos!")).toBe("barbearia-tres-irmaos");
    expect(sugerirSlug("Clínica São José — Unidade 2")).toBe("clinica-sao-jose-unidade-2");
  });

  it("não deixa hífen sobrando nas pontas", () => {
    expect(sugerirSlug("  -- Studio --  ")).toBe("studio");
  });

  it("gera slug que o banco aceita", () => {
    for (const nome of ["Salão da Ana", "Personal Léo", "Consultório Dr. Nogueira"]) {
      expect(esquemaSlug.safeParse(sugerirSlug(nome)).success).toBe(true);
    }
  });
});

describe("esquemaSlug", () => {
  it("recusa espaço, acento e maiúscula", () => {
    expect(esquemaSlug.safeParse("Salão do João").success).toBe(false);
    expect(esquemaSlug.safeParse("com espaco").success).toBe(false);
    expect(esquemaSlug.safeParse("ab").success).toBe(false);
  });

  it("aceita letra minúscula, número e hífen", () => {
    expect(esquemaSlug.safeParse("studio-ana-2").success).toBe(true);
  });
});

describe("esquemaFaixaDoDia", () => {
  it("recusa fechar antes de abrir", () => {
    const resultado = esquemaFaixaDoDia.safeParse({
      dia: 1,
      aberto: true,
      inicio: "18:00",
      fim: "09:00",
    });
    expect(resultado.success).toBe(false);
  });

  it("não cobra horário de dia fechado", () => {
    const resultado = esquemaFaixaDoDia.safeParse({
      dia: 0,
      aberto: false,
      inicio: "18:00",
      fim: "09:00",
    });
    expect(resultado.success).toBe(true);
  });
});

describe("esquemaServico", () => {
  it("aceita preço zero e recusa negativo", () => {
    const base = { nome: "Avaliação", duracao: 30, buffer: 0, preco: 0, online: true };
    expect(esquemaServico.safeParse(base).success).toBe(true);
    expect(esquemaServico.safeParse({ ...base, preco: -100 }).success).toBe(false);
  });

  it("respeita os limites de duração do banco", () => {
    const base = { nome: "Sessão", buffer: 0, preco: 10000, online: true };
    expect(esquemaServico.safeParse({ ...base, duracao: 4 }).success).toBe(false);
    expect(esquemaServico.safeParse({ ...base, duracao: 5 }).success).toBe(true);
    expect(esquemaServico.safeParse({ ...base, duracao: 600 }).success).toBe(true);
    expect(esquemaServico.safeParse({ ...base, duracao: 601 }).success).toBe(false);
  });
});
