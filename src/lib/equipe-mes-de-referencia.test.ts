import { describe, expect, it } from "vitest";

import {
  SUGESTAO_ZERADA,
  mesesDeReferencia,
  nomeDoMes,
  somarMesesAoMes,
  sugestoesDoMes,
  trocaParaVinculoSemEmprego,
} from "@/lib/equipe";

describe("mês de referência", () => {
  it("nome do mês em português", () => {
    expect(nomeDoMes("2026-09")).toBe("setembro de 2026");
    expect(nomeDoMes("2027-03")).toBe("março de 2027");
  });

  it("soma meses virando o ano", () => {
    expect(somarMesesAoMes("2026-11", 2)).toBe("2027-01");
    expect(somarMesesAoMes("2026-01", -1)).toBe("2025-12");
  });

  it("opções: de 2 meses à frente a 24 para trás, do mais recente ao mais antigo", () => {
    const opcoes = mesesDeReferencia("2026-10-05");
    expect(opcoes).toHaveLength(27);
    expect(opcoes[0]).toEqual({ valor: "2026-12", rotulo: "dezembro de 2026" });
    expect(opcoes.at(-1)?.valor).toBe("2024-10");
    expect(opcoes.every((o) => /^\d{4}-(0[1-9]|1[0-2])$/.test(o.valor))).toBe(true);
  });

  it("o mês aberto na página entra mesmo fora da faixa", () => {
    const opcoes = mesesDeReferencia("2026-10-05", ["2023-05"]);
    expect(opcoes.at(-1)).toEqual({ valor: "2023-05", rotulo: "maio de 2023" });
    expect(mesesDeReferencia("2026-10-05", ["2026-10"])).toHaveLength(27);
  });
});

describe("sugestões por mês", () => {
  const juliana = {
    id: "c-1",
    contrato: "parceria" as const,
    inicio: "2025-01-06",
    fim: null,
    fixoCents: 0,
    percentualBps: 4000,
    porAtendimentoCents: 0,
  };

  it("usa a base do mês informado", () => {
    const setembro = sugestoesDoMes([juliana], { "c-1": { baseCents: 1_200_000, atendimentos: null } }, "2026-09");
    expect(setembro["c-1"]?.percentualCents).toBe(480_000);
  });

  it("zera quem não trabalhou no mês e quem foi removido", () => {
    const antes = sugestoesDoMes([juliana], { "c-1": { baseCents: 1_000, atendimentos: null } }, "2024-12");
    expect(antes["c-1"]).toEqual(SUGESTAO_ZERADA);
    const removido = sugestoesDoMes(
      [{ ...juliana, removido: true }],
      { "c-1": { baseCents: 1_000, atendimentos: null } },
      "2026-09",
    );
    expect(removido["c-1"]).toEqual(SUGESTAO_ZERADA);
  });
});

describe("troca de vínculo que o banco recusa com histórico de emprego (0015)", () => {
  it("de CLT ou estágio para parceria, MEI, PJ ou autônomo", () => {
    expect(trocaParaVinculoSemEmprego("clt", "pj")).toBe(true);
    expect(trocaParaVinculoSemEmprego("estagio", "parceria")).toBe(true);
  });

  it("efetivação (estágio → CLT) e trocas entre vínculos sem emprego seguem livres", () => {
    expect(trocaParaVinculoSemEmprego("estagio", "clt")).toBe(false);
    expect(trocaParaVinculoSemEmprego("mei", "pj")).toBe(false);
    expect(trocaParaVinculoSemEmprego("clt", "clt")).toBe(false);
  });
});
