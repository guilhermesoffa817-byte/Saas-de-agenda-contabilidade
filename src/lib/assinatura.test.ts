import { describe, expect, it } from "vitest";

import { situacaoDaAssinatura } from "./assinatura";
import {
  DIAS_APOS_CANCELAMENTO,
  economiaAnualCents,
  limiteDeLembretes,
  limiteDeProfissionais,
  mesesGratisNoAnual,
  permiteNotaFiscal,
  PLANOS,
  precoDoCiclo,
} from "./planos";

const AGORA = new Date("2026-09-20T12:00:00Z").getTime();
const dias = (quantidade: number) =>
  new Date(AGORA + quantidade * 86_400_000).toISOString();

describe("situacaoDaAssinatura", () => {
  it("no teste grátis pode tudo e mostra quantos dias faltam", () => {
    const situacao = situacaoDaAssinatura(
      { plan: "trial", subscription_status: "trialing", trial_ends_at: dias(4) },
      AGORA,
    );
    expect(situacao.modo).toBe("teste");
    expect(situacao.podeEscrever).toBe(true);
    expect(situacao.diasRestantesDoTeste).toBe(4);
  });

  it("avisa com mais urgência quando falta um dia", () => {
    const situacao = situacaoDaAssinatura(
      { plan: "trial", subscription_status: "trialing", trial_ends_at: dias(1) },
      AGORA,
    );
    expect(situacao.mensagem).toMatch(/acabando/i);
  });

  it("teste vencido vira somente leitura, com exportação liberada", () => {
    const situacao = situacaoDaAssinatura(
      { plan: "trial", subscription_status: "trialing", trial_ends_at: dias(-1) },
      AGORA,
    );
    expect(situacao.modo).toBe("somente_leitura");
    expect(situacao.podeEscrever).toBe(false);
    expect(situacao.podeExportar).toBe(true);
    expect(situacao.mensagem).toMatch(/exportar/i);
  });

  it("atraso dentro da tolerância continua liberado, com aviso", () => {
    const situacao = situacaoDaAssinatura(
      {
        plan: "profissional",
        subscription_status: "past_due",
        trial_ends_at: dias(-40),
        past_due_since: dias(-3),
      },
      AGORA,
    );
    expect(situacao.modo).toBe("aviso");
    expect(situacao.podeEscrever).toBe(true);
    expect(situacao.diasEmAtraso).toBe(3);
    expect(situacao.mensagem).toMatch(/2 dias/);
  });

  it("atraso de mais de 5 dias vira somente leitura", () => {
    const situacao = situacaoDaAssinatura(
      {
        plan: "profissional",
        subscription_status: "past_due",
        trial_ends_at: dias(-40),
        past_due_since: dias(-6),
      },
      AGORA,
    );
    expect(situacao.modo).toBe("somente_leitura");
    expect(situacao.podeEscrever).toBe(false);
  });

  it("cancelado guarda os dados e conta o prazo", () => {
    const situacao = situacaoDaAssinatura(
      {
        plan: "essencial",
        subscription_status: "canceled",
        trial_ends_at: dias(-100),
        canceled_at: dias(-10),
      },
      AGORA,
    );
    expect(situacao.modo).toBe("somente_leitura");
    expect(situacao.diasAteApagar).toBe(DIAS_APOS_CANCELAMENTO - 10);
    expect(situacao.podeExportar).toBe(true);
  });

  it("assinatura ativa não incomoda o usuário", () => {
    const situacao = situacaoDaAssinatura(
      { plan: "negocio", subscription_status: "active", trial_ends_at: dias(-90) },
      AGORA,
    );
    expect(situacao.modo).toBe("ativa");
    expect(situacao.podeEscrever).toBe(true);
  });
});

describe("planos", () => {
  it("o anual custa dez mensalidades: dois meses de graça", () => {
    for (const chave of ["essencial", "profissional", "negocio"] as const) {
      expect(PLANOS[chave].anualCents).toBe(PLANOS[chave].mensalCents * 10);
      expect(mesesGratisNoAnual(chave)).toBe(2);
      expect(economiaAnualCents(chave)).toBe(PLANOS[chave].mensalCents * 2);
    }
  });

  it("preço por ciclo", () => {
    expect(precoDoCiclo("profissional", "mensal")).toBe(12900);
    expect(precoDoCiclo("profissional", "anual")).toBe(129000);
  });

  it("limites por plano, com o teste experimentando o plano do meio", () => {
    expect(limiteDeProfissionais("essencial")).toBe(1);
    expect(limiteDeProfissionais("profissional")).toBe(5);
    expect(limiteDeProfissionais("negocio")).toBe(Infinity);
    expect(limiteDeProfissionais("trial")).toBe(5);

    expect(limiteDeLembretes("essencial")).toBe(0);
    expect(limiteDeLembretes("negocio")).toBe(2000);

    expect(permiteNotaFiscal("negocio")).toBe(true);
    expect(permiteNotaFiscal("profissional")).toBe(false);
    // Nota fiscal não entra no teste grátis: depende de provedor contratado.
    expect(permiteNotaFiscal("trial")).toBe(false);
  });
});
